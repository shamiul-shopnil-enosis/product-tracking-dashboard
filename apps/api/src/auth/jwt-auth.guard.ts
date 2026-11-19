import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { UsersService } from '../users/users.service';

export const AUTH_COOKIE = 'pt_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new UnauthorizedException();

    let userId: string;
    try {
      userId = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException();
    }

    // Load the user on every request so deactivation and role changes apply immediately.
    const user = await this.users.findById(userId);
    if (!user || !user.active) throw new UnauthorizedException();
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return true;
  }
}
