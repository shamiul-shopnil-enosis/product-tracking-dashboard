import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Profile, ProfileDocument } from '../profiles/profile.schema';
import { currentProfileId } from '../profiles/profile-context';
import { SecretBox } from './secret-box';

/** Settings an admin may change from the screen. Everything else stays in `.env`. */
export const MANAGED_KEYS = {
  SITE_NAME: { secret: false },
  SITE_URL: { secret: false },
  CLARITY_API_TOKEN: { secret: true },
  CLARITY_PROJECT_ID: { secret: false },
  GA4_PROPERTY_ID: { secret: false },
  GA4_KEY_JSON: { secret: true },
  GA4_CLIENT_EMAIL: { secret: false },
  PAGESPEED_API_KEY: { secret: true },
} as const;
export type ManagedKey = keyof typeof MANAGED_KEYS;

export type ValueSource = 'screen' | 'server' | 'none';

const isManaged = (key: string): key is ManagedKey => key in MANAGED_KEYS;

/**
 * Reads a setting the way ConfigService does, but per profile: a value saved for the active profile wins.
 * Only the first (default) profile falls back to the server's `.env`, so a new profile never inherits another site's keys.
 * Values are held in memory, so reads stay synchronous and the clients need no changes beyond where they read from.
 * Outside a request or profile job (the sign-in page, for example) the default profile is used.
 */
@Injectable()
export class RuntimeConfig {
  private readonly logger = new Logger(RuntimeConfig.name);
  private readonly values = new Map<string, Map<string, string>>();
  private readonly envProfiles = new Set<string>();
  private defaultId: string | null = null;
  private readonly box: SecretBox;

  constructor(private readonly env: ConfigService, @InjectModel(Profile.name) private readonly model: Model<ProfileDocument>) {
    this.box = new SecretBox(env.get<string>('SETTINGS_SECRET') || env.get<string>('JWT_SECRET') || 'change-me');
  }

  /** Reads one profile's saved settings into memory (startup, and after a profile is created or changed). */
  load(profile: { id: string; isDefault?: boolean; settings?: Record<string, string> }) {
    const map = new Map<string, string>();
    for (const [key, stored] of Object.entries(profile.settings ?? {})) {
      if (!isManaged(key)) continue;
      const value = MANAGED_KEYS[key].secret ? this.box.decrypt(stored) : stored;
      if (value === null) this.logger.warn(`Could not decrypt the saved ${key} of a profile. Was SETTINGS_SECRET or JWT_SECRET changed? It will be ignored until saved again.`);
      else map.set(key, value);
    }
    this.values.set(profile.id, map);
    if (profile.isDefault) { this.envProfiles.add(profile.id); this.defaultId = profile.id; } else this.envProfiles.delete(profile.id);
  }

  drop(profileId: string) { this.values.delete(profileId); this.envProfiles.delete(profileId); }

  private pid(): string | null { return currentProfileId() ?? this.defaultId; }

  get<T = string>(key: string, fallback?: T): T | undefined {
    if (!isManaged(key)) return this.env.get<T>(key, fallback as T);
    const p = this.pid();
    const o = p ? this.values.get(p)?.get(key) : undefined;
    if (o !== undefined) return o as unknown as T;
    if (p && this.envProfiles.has(p)) return this.env.get<T>(key, fallback as T);
    return fallback;
  }

  /** Where the value in use comes from. */
  source(key: ManagedKey): ValueSource {
    const p = this.pid();
    if (p && this.values.get(p)?.has(key)) return 'screen';
    return p && this.envProfiles.has(p) && (this.env.get<string>(key) ?? '').toString().trim() ? 'server' : 'none';
  }

  private requirePid(): string {
    const p = this.pid();
    if (!p) throw new Error('No profile is active');
    return p;
  }

  async set(key: ManagedKey, value: string): Promise<void> {
    const p = this.requirePid();
    const stored = MANAGED_KEYS[key].secret ? this.box.encrypt(value) : value;
    await this.model.updateOne({ _id: p }, { $set: { [`settings.${key}`]: stored } });
    let map = this.values.get(p); if (!map) this.values.set(p, (map = new Map()));
    map.set(key, value);
  }

  /** Go back to the value in `.env` (default profile) or to nothing (any other profile). */
  async clear(key: ManagedKey): Promise<void> {
    const p = this.requirePid();
    await this.model.updateOne({ _id: p }, { $unset: { [`settings.${key}`]: '' } });
    this.values.get(p)?.delete(key);
  }
}
