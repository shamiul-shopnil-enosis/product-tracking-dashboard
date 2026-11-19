import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '../common/roles';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

function setup(user: unknown) {
  const users = { findByEmail: jest.fn().mockResolvedValue(user) } as unknown as UsersService;
  const jwt = { signAsync: jest.fn().mockResolvedValue('tok') } as unknown as JwtService;
  return new AuthService(users, jwt);
}

const base = {
  id: 'u1',
  name: 'A',
  email: 'a@x.com',
  role: Role.Editor,
  active: true,
  passwordHash: bcrypt.hashSync('correct-horse-1', 4),
};

describe('AuthService.login', () => {
  it('returns a token and the public user for valid credentials', async () => {
    const res = await setup(base).login('a@x.com', 'correct-horse-1');
    expect(res.token).toBe('tok');
    expect(res.user).toEqual({ id: 'u1', name: 'A', email: 'a@x.com', role: Role.Editor, active: true });
    expect(JSON.stringify(res)).not.toContain('passwordHash');
  });

  it('rejects a wrong password', async () => {
    await expect(setup(base).login('a@x.com', 'nope')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown email', async () => {
    await expect(setup(null).login('x@x.com', 'whatever')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a deactivated user even with the right password', async () => {
    await expect(
      setup({ ...base, active: false }).login('a@x.com', 'correct-horse-1'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
