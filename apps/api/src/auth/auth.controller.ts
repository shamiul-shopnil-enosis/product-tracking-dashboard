import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './jwt-auth.guard';
import { LoginThrottle } from './login-throttle';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  // Per email: stops guessing one account. Per address: a coarse guard against sweeping many accounts.
  private readonly byEmail = new LoginThrottle(5, WINDOW_MS);
  private readonly byAddress = new LoginThrottle(30, WINDOW_MS);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const emailKey = dto.email.trim().toLowerCase();
    const addressKey = req.ip ?? 'unknown';
    const wait = Math.max(this.byEmail.retryAfterMs(emailKey), this.byAddress.retryAfterMs(addressKey));
    if (wait > 0) {
      res.setHeader('Retry-After', Math.ceil(wait / 1000));
      throw new HttpException(`Too many failed sign-in attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).`, 429);
    }
    let result;
    try {
      result = await this.auth.login(dto.email, dto.password);
    } catch (err) {
      this.byEmail.fail(emailKey);
      this.byAddress.fail(addressKey);
      throw err;
    }
    this.byEmail.reset(emailKey);
    const { token, user } = result;
    res.cookie(AUTH_COOKIE, token, { ...this.cookieOptions(), maxAge: WEEK_MS });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
