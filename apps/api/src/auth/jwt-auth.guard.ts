import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { UsersService } from '../users/users.service';
import { AUTH_COOKIE, SessionService } from './session.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly session: SessionService,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const token: string | undefined = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new UnauthorizedException();

    const claims = await this.session.read(token);
    if (!claims) throw new UnauthorizedException();

    // Load the user on every request so deactivation, role changes and sign-out apply immediately.
    const user = await this.users.findById(claims.sub);
    if (!user || !user.active) throw new UnauthorizedException();
    if (claims.v !== (user.tokenVersion ?? 0)) throw new UnauthorizedException();

    const now = Math.floor(Date.now() / 1000);
    if (now - claims.st > this.session.maxSeconds) throw new UnauthorizedException();

    // Keep a working person signed in: renew the token (and the idle window) now and then.
    if (now - claims.iat > this.session.refreshAfterSeconds) {
      this.session.setCookie(http.getResponse(), await this.session.sign(user, claims.st));
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return true;
  }
}
