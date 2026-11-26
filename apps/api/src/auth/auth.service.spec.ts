import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '../common/roles';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

const base = {
  id: 'u1',
  name: 'A',
  email: 'a@x.com',
  role: Role.Editor,
  active: true,
  tokenVersion: 3,
  passwordHash: bcrypt.hashSync('correct-horse-1', 4),
};

function setup(user: unknown) {
  const users = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    markLogin: jest.fn().mockResolvedValue(undefined),
    hash: jest.fn().mockResolvedValue('new-hash'),
    changePassword: jest.fn().mockResolvedValue({ ...(user as object), tokenVersion: 4 }),
  };
  const session = { sign: jest.fn().mockResolvedValue('tok') };
  return { service: new AuthService(users as unknown as UsersService, session as unknown as SessionService), users, session };
}

describe('AuthService.login', () => {
  it('returns a token and the public user for valid credentials, and records the sign-in', async () => {
    const { service, users, session } = setup(base);
    const res = await service.login('a@x.com', 'correct-horse-1');
    expect(res.token).toBe('tok');
    expect(res.user).toEqual({ id: 'u1', name: 'A', email: 'a@x.com', role: Role.Editor, active: true, superAdmin: false, memberships: [] });
    expect(JSON.stringify(res)).not.toContain('passwordHash');
    expect(users.markLogin).toHaveBeenCalledWith('u1');
    expect(session.sign).toHaveBeenCalledWith(base);
  });

  it('rejects a wrong password', async () => {
    await expect(setup(base).service.login('a@x.com', 'nope')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown email with the same message as a wrong password', async () => {
    const wrong = await setup(base).service.login('a@x.com', 'nope').catch((e) => e.message);
    const unknown = await setup(null).service.login('x@x.com', 'whatever').catch((e) => e.message);
    expect(unknown).toBe(wrong);
  });

  it('rejects an invited user who has not set a password yet, in the same words', async () => {
    const { passwordHash: _omit, ...invited } = base;
    const res = await setup(invited).service.login('a@x.com', 'anything-at-all').catch((e) => e);
    expect(res).toBeInstanceOf(UnauthorizedException);
    expect(res.message).toBe('Invalid email or password');
  });

  it('tells a deactivated user why, but only once the password was right', async () => {
    const off = { ...base, active: false };
    await expect(setup(off).service.login('a@x.com', 'correct-horse-1')).rejects.toThrow(ForbiddenException);
    await expect(setup(off).service.login('a@x.com', 'wrong')).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.changePassword', () => {
  it('sets the new password and returns a token for this device', async () => {
    const { service, users, session } = setup(base);
    const res = await service.changePassword('u1', 'correct-horse-1', 'a-new-password-9');
    expect(users.changePassword).toHaveBeenCalledWith('u1', 'new-hash');
    expect(session.sign).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 4 }));
    expect(res.token).toBe('tok');
  });

  it('answers a wrong current password with 400, never 401', async () => {
    const { service, users } = setup(base);
    await expect(service.changePassword('u1', 'wrong', 'a-new-password-9')).rejects.toThrow(BadRequestException);
    expect(users.changePassword).not.toHaveBeenCalled();
  });

  it('refuses a new password equal to the current one', async () => {
    await expect(setup(base).service.changePassword('u1', 'correct-horse-1', 'correct-horse-1')).rejects.toThrow(BadRequestException);
  });
});
