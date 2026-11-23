import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ManagedKey, RuntimeConfig, ValueSource } from '../settings/runtime-config';
import { Ga4Client } from './ga4.client';

export const DEFAULT_SITE_NAME = 'Enosis Outsourcing';

export interface SettingsView {
  site: { name: string; url: string };
  clarity: { configured: boolean; source: ValueSource };
  ga4: { savedHere: boolean; propertyId: string; clientEmail: string | null; keySource: 'screen' | 'file' | 'none'; configured: boolean; problem: string | null };
  pagespeed: { configured: boolean; source: ValueSource };
}

const TOKEN_RE = /^\S{10,5000}$/;
const PROPERTY_RE = /^\d{4,15}$/;
const PSI_KEY_RE = /^[A-Za-z0-9_-]{20,80}$/;

/** Validates what an admin types, saves it, and tells the connections to pick it up. Secret values are never returned. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly cfg: RuntimeConfig, private readonly ga4: Ga4Client) {}

  siteName(): string {
    return (this.cfg.get<string>('SITE_NAME') ?? '').trim() || DEFAULT_SITE_NAME;
  }

  view(): SettingsView {
    const keySource = this.cfg.source('GA4_KEY_JSON') === 'screen' ? 'screen' : this.ga4.problem?.includes('service-account key') ? 'none' : 'file';
    return {
      site: { name: this.siteName(), url: (this.cfg.get<string>('SITE_URL') ?? '').trim() },
      clarity: { configured: this.cfg.source('CLARITY_API_TOKEN') !== 'none', source: this.cfg.source('CLARITY_API_TOKEN') },
      ga4: { savedHere: this.cfg.source('GA4_KEY_JSON') === 'screen' || this.cfg.source('GA4_PROPERTY_ID') === 'screen', propertyId: this.ga4.propertyId, clientEmail: (this.cfg.get<string>('GA4_CLIENT_EMAIL') ?? '').trim() || null, keySource, configured: this.ga4.configured, problem: this.ga4.problem },
      pagespeed: { configured: this.cfg.source('PAGESPEED_API_KEY') !== 'none', source: this.cfg.source('PAGESPEED_API_KEY') },
    };
  }

  private log(who: string, what: string) {
    this.logger.log(`${who} changed ${what}`); // never the value
  }

  async setSite(input: { name: string; url?: string }, who: string): Promise<SettingsView> {
    const name = (input.name ?? '').trim();
    if (!name || name.length > 80) throw new BadRequestException('Give the site a name of 1 to 80 characters');
    let url = (input.url ?? '').trim();
    if (url) {
      try {
        const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
        if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('bad');
        url = u.origin;
      } catch {
        throw new BadRequestException('The web address is not valid. Use something like https://example.com');
      }
    }
    await this.cfg.set('SITE_NAME', name);
    if (url) await this.cfg.set('SITE_URL', url); else await this.cfg.clear('SITE_URL');
    this.log(who, 'the site name and address');
    return this.view();
  }

  async setClarity(token: string, who: string): Promise<SettingsView> {
    const t = (token ?? '').trim();
    if (!TOKEN_RE.test(t)) throw new BadRequestException('That does not look like a Clarity API token (10 or more characters, no spaces)');
    await this.cfg.set('CLARITY_API_TOKEN', t);
    this.log(who, 'the Clarity token');
    return this.view();
  }

  async clearClarity(who: string): Promise<SettingsView> {
    await this.cfg.clear('CLARITY_API_TOKEN');
    this.log(who, 'the Clarity token (removed)');
    return this.view();
  }

  async setGa4(input: { propertyId?: string; keyJson?: string }, who: string): Promise<SettingsView> {
    const propertyId = (input.propertyId ?? '').trim();
    if (propertyId && !PROPERTY_RE.test(propertyId)) throw new BadRequestException('The GA4 property ID is a number, for example 490022412');
    let key: { client_email: string } | null = null;
    if (input.keyJson !== undefined && input.keyJson !== '') {
      if (input.keyJson.length > 20_000) throw new BadRequestException('That file is too large to be a service-account key');
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(input.keyJson); } catch { throw new BadRequestException('The key file is not valid JSON'); }
      if (parsed.type !== 'service_account' || typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string' || !parsed.private_key.includes('PRIVATE KEY')) {
        throw new BadRequestException('That is not a Google service-account key file (it should contain type, client_email and private_key)');
      }
      key = { client_email: parsed.client_email };
      await this.cfg.set('GA4_KEY_JSON', JSON.stringify(parsed));
      await this.cfg.set('GA4_CLIENT_EMAIL', parsed.client_email);
    }
    if (propertyId) await this.cfg.set('GA4_PROPERTY_ID', propertyId);
    if (!propertyId && !key) throw new BadRequestException('Give a property ID, a key file, or both');
    this.ga4.reset();
    this.log(who, `GA4 (${[propertyId && 'property', key && 'key'].filter(Boolean).join(' and ')})`);
    return this.view();
  }

  async clearGa4(who: string): Promise<SettingsView> {
    for (const k of ['GA4_PROPERTY_ID', 'GA4_KEY_JSON', 'GA4_CLIENT_EMAIL'] as ManagedKey[]) await this.cfg.clear(k);
    this.ga4.reset();
    this.log(who, 'GA4 (removed)');
    return this.view();
  }

  async setPagespeed(key: string, who: string): Promise<SettingsView> {
    const k = (key ?? '').trim();
    if (!PSI_KEY_RE.test(k)) throw new BadRequestException('That does not look like a Google API key');
    await this.cfg.set('PAGESPEED_API_KEY', k);
    this.log(who, 'the PageSpeed key');
    return this.view();
  }

  async clearPagespeed(who: string): Promise<SettingsView> {
    await this.cfg.clear('PAGESPEED_API_KEY');
    this.log(who, 'the PageSpeed key (removed)');
    return this.view();
  }
}
