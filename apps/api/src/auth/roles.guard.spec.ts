import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, MIN_ROLE_KEY } from '../common/decorators';
import { Role } from '../common/roles';
import { RolesGuard } from './roles.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(meta: Record<string, unknown>) {
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('lets public routes through', () => {
    expect(guardWith({ [IS_PUBLIC_KEY]: true }).canActivate(ctx(undefined))).toBe(true);
  });

  it('lets any signed-in user through when no role is required', () => {
    expect(guardWith({}).canActivate(ctx({ role: Role.Viewer }))).toBe(true);
  });

  it('allows a role at or above the minimum', () => {
    const g = guardWith({ [MIN_ROLE_KEY]: Role.Editor });
    expect(g.canActivate(ctx({ role: Role.Admin }))).toBe(true);
    expect(g.canActivate(ctx({ role: Role.Editor }))).toBe(true);
  });

  it('forbids a role below the minimum', () => {
    const g = guardWith({ [MIN_ROLE_KEY]: Role.Editor });
    expect(() => g.canActivate(ctx({ role: Role.Viewer }))).toThrow(ForbiddenException);
  });
});
