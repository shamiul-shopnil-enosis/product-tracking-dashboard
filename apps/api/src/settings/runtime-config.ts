import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSetting, AppSettingDocument } from '../analytics/analytics.schema';
import { SecretBox } from './secret-box';

const PREFIX = 'cfg.';

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

/**
 * Reads a setting the way ConfigService does, but a value saved from the screen wins over `.env`.
 * Values are held in memory, so reads stay synchronous and the clients need no changes beyond where they read from.
 */
@Injectable()
export class RuntimeConfig implements OnModuleInit {
  private readonly logger = new Logger(RuntimeConfig.name);
  private readonly overrides = new Map<string, string>();
  private readonly box: SecretBox;

  constructor(private readonly env: ConfigService, @InjectModel(AppSetting.name) private readonly model: Model<AppSettingDocument>) {
    this.box = new SecretBox(env.get<string>('SETTINGS_SECRET') || env.get<string>('JWT_SECRET') || 'change-me');
  }

  async onModuleInit() {
    const docs = await this.model.find({ key: { $regex: `^${PREFIX.replace('.', '\\.')}` } }).lean();
    for (const d of docs) {
      const key = d.key.slice(PREFIX.length) as ManagedKey;
      const meta = MANAGED_KEYS[key];
      if (!meta) continue;
      const value = meta.secret ? this.box.decrypt(d.value) : d.value;
      if (value === null) this.logger.warn(`Could not decrypt the saved ${key}. Was SETTINGS_SECRET or JWT_SECRET changed? It will be ignored until saved again.`);
      else this.overrides.set(key, value);
    }
  }

  get<T = string>(key: string, fallback?: T): T | undefined {
    const o = this.overrides.get(key);
    if (o !== undefined) return o as unknown as T;
    return this.env.get<T>(key, fallback as T);
  }

  /** Where the value in use comes from. */
  source(key: ManagedKey): ValueSource {
    if (this.overrides.has(key)) return 'screen';
    return (this.env.get<string>(key) ?? '').toString().trim() ? 'server' : 'none';
  }

  async set(key: ManagedKey, value: string): Promise<void> {
    const stored = MANAGED_KEYS[key].secret ? this.box.encrypt(value) : value;
    await this.model.updateOne({ key: PREFIX + key }, { $set: { value: stored } }, { upsert: true });
    this.overrides.set(key, value);
  }

  /** Go back to the value in `.env`, if any. */
  async clear(key: ManagedKey): Promise<void> {
    await this.model.deleteOne({ key: PREFIX + key });
    this.overrides.delete(key);
  }
}
