import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

export const AUTH_COOKIE = 'pt_token';

export interface SessionClaims {
  /** user id */
  sub: string;
  /** the user's session counter when this token was issued */
  v: number;
  /** when the sign-in started (seconds); a refresh keeps it, so the absolute limit holds */
  st: number;
  /** when this token was issued (seconds) */
  iat: number;
}

const num = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Sign-in tokens and the cookie that carries them. A token lasts SESSION_IDLE_HOURS and is renewed
 * while the person keeps working. No sign-in lasts longer than SESSION_MAX_DAYS in total.
 */
@Injectable()
export class SessionService {
  readonly idleSeconds: number;
  readonly maxSeconds: number;
  readonly refreshAfterSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.idleSeconds = Math.max(1, Math.round(num(config.get('SESSION_IDLE_HOURS'), 12) * 3600));
    this.maxSeconds = Math.round(num(config.get('SESSION_MAX_DAYS'), 7) * 86400);
    this.refreshAfterSeconds = Math.max(1, Math.min(900, Math.floor(this.idleSeconds / 4)));
  }

  sign(user: { id?: string; tokenVersion?: number }, startedAt = Math.floor(Date.now() / 1000)) {
    return this.jwt.signAsync({ sub: user.id as string, v: user.tokenVersion ?? 0, st: startedAt }, { expiresIn: this.idleSeconds });
  }

  /** The claims, or null for anything missing, forged, expired or issued before sessions were versioned. */
  async read(token: string): Promise<SessionClaims | null> {
    try {
      const c = await this.jwt.verifyAsync<Partial<SessionClaims>>(token);
      if (typeof c.sub !== 'string' || typeof c.v !== 'number' || typeof c.st !== 'number' || typeof c.iat !== 'number') return null;
      return c as SessionClaims;
    } catch {
      return null;
    }
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/',
    };
  }

  setCookie(res: Response, token: string) {
    res.cookie(AUTH_COOKIE, token, { ...this.cookieOptions(), maxAge: this.idleSeconds * 1000 });
  }

  clearCookie(res: Response) {
    res.clearCookie(AUTH_COOKIE, this.cookieOptions());
  }
}
