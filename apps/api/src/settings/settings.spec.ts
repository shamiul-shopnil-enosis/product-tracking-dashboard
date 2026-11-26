import { SecretBox } from './secret-box';
import { RuntimeConfig } from './runtime-config';

describe('SecretBox', () => {
  const box = new SecretBox('a long passphrase');
  it('round-trips and does not store the plain text', () => {
    const stored = box.encrypt('my-secret-token');
    expect(stored).not.toContain('my-secret-token');
    expect(SecretBox.isEncrypted(stored)).toBe(true);
    expect(box.decrypt(stored)).toBe('my-secret-token');
  });
  it('gives a different result each time', () => {
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });
  it('cannot be read with another passphrase, or after tampering', () => {
    const stored = box.encrypt('secret');
    expect(new SecretBox('another').decrypt(stored)).toBeNull();
    expect(box.decrypt(stored.slice(0, -4) + 'AAAA')).toBeNull();
    expect(box.decrypt('plain text')).toBeNull();
  });
});

import { runWithProfile } from '../profiles/profile-context';

function make(env: Record<string, string>) {
  const stored: Record<string, Record<string, string>> = {};
  const model = {
    updateOne: jest.fn(async (filter: { _id: string }, update: { $set?: Record<string, string>; $unset?: Record<string, string> }) => {
      const doc = (stored[filter._id] ??= {});
      for (const [k, v] of Object.entries(update.$set ?? {})) doc[k.replace('settings.', '')] = v;
      for (const k of Object.keys(update.$unset ?? {})) delete doc[k.replace('settings.', '')];
      return {};
    }),
  };
  const cfg = new RuntimeConfig({ get: (k: string, d?: unknown) => env[k] ?? d } as never, model as never);
  return { cfg, model, stored };
}

describe('RuntimeConfig (per profile)', () => {
  it('the first profile uses .env until something is saved for it', () => {
    const { cfg } = make({ CLARITY_API_TOKEN: 'from-env-token-123', JWT_SECRET: 's' });
    cfg.load({ id: 'A', isDefault: true });
    runWithProfile('A', () => {
      expect(cfg.get('CLARITY_API_TOKEN')).toBe('from-env-token-123');
      expect(cfg.source('CLARITY_API_TOKEN')).toBe('server');
      expect(cfg.source('PAGESPEED_API_KEY')).toBe('none');
    });
  });

  it('another profile never inherits the .env keys', () => {
    const { cfg } = make({ CLARITY_API_TOKEN: 'from-env-token-123', GA4_PROPERTY_ID: '111', JWT_SECRET: 's' });
    cfg.load({ id: 'A', isDefault: true });
    cfg.load({ id: 'B' });
    runWithProfile('B', () => {
      expect(cfg.get('CLARITY_API_TOKEN')).toBeUndefined();
      expect(cfg.get('GA4_PROPERTY_ID')).toBeUndefined();
      expect(cfg.source('CLARITY_API_TOKEN')).toBe('none');
    });
  });

  it('a value saved for one profile is invisible to the others, and is stored encrypted', async () => {
    const { cfg, stored } = make({ JWT_SECRET: 's' });
    cfg.load({ id: 'A', isDefault: true });
    cfg.load({ id: 'B' });
    await runWithProfile('B', () => cfg.set('CLARITY_API_TOKEN', 'screen-token-456'));
    runWithProfile('B', () => { expect(cfg.get('CLARITY_API_TOKEN')).toBe('screen-token-456'); expect(cfg.source('CLARITY_API_TOKEN')).toBe('screen'); });
    runWithProfile('A', () => expect(cfg.get('CLARITY_API_TOKEN')).toBeUndefined());
    expect(stored.B.CLARITY_API_TOKEN).not.toContain('screen-token-456');
  });

  it('keeps ordinary settings readable and secrets encrypted across a restart', async () => {
    const first = make({ JWT_SECRET: 's' });
    first.cfg.load({ id: 'A', isDefault: true });
    await runWithProfile('A', async () => { await first.cfg.set('CLARITY_API_TOKEN', 'screen-token-456'); await first.cfg.set('SITE_NAME', 'Enosis Solutions'); });
    const second = make({ JWT_SECRET: 's' });
    second.cfg.load({ id: 'A', isDefault: true, settings: first.stored.A });
    runWithProfile('A', () => { expect(second.cfg.get('CLARITY_API_TOKEN')).toBe('screen-token-456'); expect(second.cfg.get('SITE_NAME')).toBe('Enosis Solutions'); });
  });

  it('ignores a saved secret it can no longer decrypt, and falls back to .env for the default profile', async () => {
    const first = make({ JWT_SECRET: 'old' });
    first.cfg.load({ id: 'A', isDefault: true });
    await runWithProfile('A', () => first.cfg.set('CLARITY_API_TOKEN', 'screen-token-456'));
    const second = make({ JWT_SECRET: 'new', CLARITY_API_TOKEN: 'env-token-789012' });
    second.cfg.load({ id: 'A', isDefault: true, settings: first.stored.A });
    runWithProfile('A', () => expect(second.cfg.get('CLARITY_API_TOKEN')).toBe('env-token-789012'));
  });

  it('can go back to .env (default profile)', async () => {
    const { cfg } = make({ PAGESPEED_API_KEY: 'env-key-abcdefghijklmnop', JWT_SECRET: 's' });
    cfg.load({ id: 'A', isDefault: true });
    await runWithProfile('A', async () => {
      await cfg.set('PAGESPEED_API_KEY', 'screen-key-abcdefghijklmnop');
      await cfg.clear('PAGESPEED_API_KEY');
      expect(cfg.get('PAGESPEED_API_KEY')).toBe('env-key-abcdefghijklmnop');
    });
  });

  it('reads the default profile when no profile is active (the sign-in page)', () => {
    const { cfg } = make({ JWT_SECRET: 's' });
    cfg.load({ id: 'A', isDefault: true, settings: { SITE_NAME: 'Enosis Outsourcing' } });
    expect(cfg.get('SITE_NAME')).toBe('Enosis Outsourcing');
  });
});
