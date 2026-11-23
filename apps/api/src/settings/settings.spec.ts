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

function make(env: Record<string, string>, docs: { key: string; value: string }[] = []) {
  const model = {
    find: jest.fn(() => ({ lean: async () => docs })),
    updateOne: jest.fn().mockResolvedValue({}),
    deleteOne: jest.fn().mockResolvedValue({}),
  };
  const cfg = new RuntimeConfig({ get: (k: string, d?: unknown) => env[k] ?? d } as never, model as never);
  return { cfg, model };
}

describe('RuntimeConfig', () => {
  it('uses .env until something is saved from the screen', async () => {
    const { cfg } = make({ CLARITY_API_TOKEN: 'from-env-token-123', JWT_SECRET: 's' });
    await cfg.onModuleInit();
    expect(cfg.get('CLARITY_API_TOKEN')).toBe('from-env-token-123');
    expect(cfg.source('CLARITY_API_TOKEN')).toBe('server');
    expect(cfg.source('PAGESPEED_API_KEY')).toBe('none');
  });

  it('a value saved from the screen wins and is stored encrypted', async () => {
    const { cfg, model } = make({ CLARITY_API_TOKEN: 'from-env-token-123', JWT_SECRET: 's' });
    await cfg.onModuleInit();
    await cfg.set('CLARITY_API_TOKEN', 'screen-token-456');
    expect(cfg.get('CLARITY_API_TOKEN')).toBe('screen-token-456');
    expect(cfg.source('CLARITY_API_TOKEN')).toBe('screen');
    const stored = model.updateOne.mock.calls[0][1].$set.value as string;
    expect(stored).not.toContain('screen-token-456');
    expect(model.updateOne.mock.calls[0][0]).toEqual({ key: 'cfg.CLARITY_API_TOKEN' });
  });

  it('keeps ordinary settings readable and secrets encrypted across a restart', async () => {
    const first = make({ JWT_SECRET: 's' });
    await first.cfg.set('CLARITY_API_TOKEN', 'screen-token-456');
    await first.cfg.set('SITE_NAME', 'Enosis Solutions');
    const docs = first.model.updateOne.mock.calls.map((c) => ({ key: c[0].key as string, value: c[1].$set.value as string }));
    const second = make({ JWT_SECRET: 's' }, docs);
    await second.cfg.onModuleInit();
    expect(second.cfg.get('CLARITY_API_TOKEN')).toBe('screen-token-456');
    expect(second.cfg.get('SITE_NAME')).toBe('Enosis Solutions');
  });

  it('ignores a saved secret it can no longer decrypt, and falls back to .env', async () => {
    const first = make({ JWT_SECRET: 'old' });
    await first.cfg.set('CLARITY_API_TOKEN', 'screen-token-456');
    const docs = first.model.updateOne.mock.calls.map((c) => ({ key: c[0].key as string, value: c[1].$set.value as string }));
    const second = make({ JWT_SECRET: 'new', CLARITY_API_TOKEN: 'env-token-789012' }, docs);
    await second.cfg.onModuleInit();
    expect(second.cfg.get('CLARITY_API_TOKEN')).toBe('env-token-789012');
  });

  it('can go back to .env', async () => {
    const { cfg, model } = make({ PAGESPEED_API_KEY: 'env-key-abcdefghijklmnop', JWT_SECRET: 's' });
    await cfg.set('PAGESPEED_API_KEY', 'screen-key-abcdefghijklmnop');
    await cfg.clear('PAGESPEED_API_KEY');
    expect(cfg.get('PAGESPEED_API_KEY')).toBe('env-key-abcdefghijklmnop');
    expect(model.deleteOne).toHaveBeenCalledWith({ key: 'cfg.PAGESPEED_API_KEY' });
  });
});
