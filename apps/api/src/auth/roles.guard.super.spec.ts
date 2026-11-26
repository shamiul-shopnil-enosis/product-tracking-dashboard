import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../common/roles';
import { RolesGuard } from './roles.guard';

const ctx = (user: unknown) => ({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
const guard = (meta: Record<string, unknown>) => new RolesGuard({ getAllAndOverride: (k: string) => meta[k] } as unknown as Reflector);

describe('RolesGuard (super admin routes)', () => {
  it('lets only super admins through, even when a profile admin asks', () => {
    const g = guard({ superAdminOnly: true });
    expect(g.canActivate(ctx({ role: Role.Admin, superAdmin: true }))).toBe(true);
    expect(() => g.canActivate(ctx({ role: Role.Admin, superAdmin: false }))).toThrow(ForbiddenException);
  });
});
