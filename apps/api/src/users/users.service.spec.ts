import { BadRequestException } from '@nestjs/common';
import { Role } from '../common/roles';
import { hashLinkToken, toAdmin, UsersService } from './users.service';

const doc = (over: Record<string, unknown> = {}) =>
  ({ id: 'u1', name: 'A', email: 'a@x.com', role: Role.Viewer, active: true, passwordHash: 'h', ...over }) as never;

describe('toAdmin', () => {
  it('is active with a password, invited without one, deactivated when switched off', () => {
    expect(toAdmin(doc()).status).toBe('active');
    expect(toAdmin(doc({ passwordHash: undefined })).status).toBe('invited');
    expect(toAdmin(doc({ active: false })).status).toBe('deactivated');
  });

  it('shows a pending link and whether it has expired, never the token hash', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const live = toAdmin(doc({ linkTokenHash: 'x', linkPurpose: 'reset', linkExpiresAt: new Date('2026-11-21T00:00:00Z') }), now);
    expect(live.link).toEqual({ purpose: 'reset', expiresAt: '2026-11-21T00:00:00.000Z', expired: false });
    const dead = toAdmin(doc({ linkTokenHash: 'x', linkPurpose: 'invite', linkExpiresAt: new Date('2026-11-19T00:00:00Z') }), now);
    expect(dead.link?.expired).toBe(true);
    expect(JSON.stringify(live)).not.toContain('linkTokenHash');
    expect(JSON.stringify(live)).not.toContain('passwordHash');
  });
});

describe('hashLinkToken', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(hashLinkToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

function service(model: Record<string, unknown>) {
  return new UsersService(model as never, { get: () => undefined } as never);
}

describe('UsersService links', () => {
  it('issues an invite for someone with no password and a reset for someone with one, storing only a hash', async () => {
    for (const [pw, purpose] of [[undefined, 'invite'], ['h', 'reset']] as const) {
      const u = { ...(doc({ passwordHash: pw }) as object), save: jest.fn() } as Record<string, unknown>;
      const svc = service({});
      jest.spyOn(svc, 'findById').mockResolvedValue(u as never);
      const out = await svc.issueLink('u1');
      expect(out.purpose).toBe(purpose);
      expect(out.token.length).toBeGreaterThanOrEqual(40);
      expect(u.linkTokenHash).toBe(hashLinkToken(out.token));
      expect(u.linkTokenHash).not.toBe(out.token);
      expect(u.save).toHaveBeenCalled();
    }
  });

  it('refuses a link for a deactivated user', async () => {
    const svc = service({});
    jest.spyOn(svc, 'findById').mockResolvedValue({ ...(doc({ active: false }) as object), save: jest.fn() } as never);
    await expect(svc.issueLink('u1')).rejects.toThrow(BadRequestException);
  });

  it('redeems a live link once: the atomic update clears it and moves the session counter', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({ id: 'u1' });
    const svc = service({ exists: async () => ({ _id: 1 }), findOneAndUpdate });
    await svc.redeemLink('t'.repeat(43), 'a-long-password-1');
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter.linkTokenHash).toBe(hashLinkToken('t'.repeat(43)));
    expect(filter.active).toBe(true);
    expect(update.$unset).toEqual({ linkTokenHash: 1, linkPurpose: 1, linkExpiresAt: 1 });
    expect(update.$inc).toEqual({ tokenVersion: 1 });
    expect(update.$set.passwordHash).toBeDefined();
    expect(update.$set.passwordHash).not.toBe('a-long-password-1');
  });

  it('rejects an unknown, expired or already-used link, before hashing a password', async () => {
    const findOneAndUpdate = jest.fn();
    const svc = service({ exists: async () => null, findOneAndUpdate });
    await expect(svc.redeemLink('t'.repeat(43), 'a-long-password-1')).rejects.toThrow(BadRequestException);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects when another request used the link between the check and the update', async () => {
    const svc = service({ exists: async () => ({ _id: 1 }), findOneAndUpdate: async () => null });
    await expect(svc.redeemLink('t'.repeat(43), 'a-long-password-1')).rejects.toThrow(BadRequestException);
  });

  it('deactivating ends sessions and cancels a pending link', async () => {
    const u = { ...(doc({ tokenVersion: 1, linkTokenHash: 'x', linkPurpose: 'invite', linkExpiresAt: new Date() }) as object), save: jest.fn() } as Record<string, unknown>;
    const svc = service({});
    jest.spyOn(svc, 'findById').mockResolvedValue(u as never);
    await svc.update('u1', { active: false });
    expect(u.tokenVersion).toBe(2);
    expect(u.linkTokenHash).toBeUndefined();
    expect(u.active).toBe(false);
  });
});
