import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, MIN_ROLE_KEY } from '../common/decorators';
import { hasMinRole, Role } from '../common/roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const minimum = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, targets);
    if (!minimum) return true; // any signed-in user
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !hasMinRole(user.role, minimum)) throw new ForbiddenException();
    return true;
  }
}
