import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, NoProfile, Public } from '../common/decorators';
import { ProfilesService } from '../profiles/profiles.service';
import { PROFILE_HEADER } from './profile.guard';
import { toPublic, UsersService } from '../users/users.service';
import { AcceptLinkDto, ChangePasswordDto, LinkTokenDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { LoginThrottle } from './login-throttle';
import { AUTH_COOKIE, SessionService } from './session.service';

const WINDOW_MS = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
  // Per email: stops guessing one account. Per address: a coarse guard against sweeping many accounts.
  private readonly byEmail = new LoginThrottle(5, WINDOW_MS);
  private readonly byAddress = new LoginThrottle(30, WINDOW_MS);
  // Wrong "current password" when changing a password, per signed-in user.
  private readonly byUser = new LoginThrottle(5, WINDOW_MS);
  // Bad invite or reset tokens, per address. A real token is 256 random bits, so this only stops noise.
  private readonly byLinkAddress = new LoginThrottle(20, WINDOW_MS);

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly session: SessionService,
    private readonly profiles: ProfilesService,
  ) {}

  private block(wait: number, res: Response): never | void {
    if (wait <= 0) return;
    res.setHeader('Retry-After', Math.ceil(wait / 1000));
    throw new HttpException(`Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).`, 429);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const emailKey = dto.email.trim().toLowerCase();
    const addressKey = req.ip ?? 'unknown';
    this.block(Math.max(this.byEmail.retryAfterMs(emailKey), this.byAddress.retryAfterMs(addressKey)), res);
    let result;
    try {
      result = await this.auth.login(dto.email, dto.password);
    } catch (err) {
      this.byEmail.fail(emailKey);
      this.byAddress.fail(addressKey);
      throw err;
    }
    this.byEmail.reset(emailKey);
    this.session.setCookie(res, result.token);
    return result.user;
  }

  /** Ends this sign-in everywhere: the counter moves on, so any copy of the cookie stops working. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = req.cookies?.[AUTH_COOKIE];
    const claims = token ? await this.session.read(token) : null;
    if (claims) await this.users.revokeSessions(claims.sub, claims.v);
    this.session.clearCookie(res);
  }

  /** Who is signed in, which profiles they may open and the role they hold in the one they are looking at. */
  @NoProfile()
  @Get('me')
  me(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const profiles = this.profiles.accessibleTo(user);
    const wanted = String(req.headers[PROFILE_HEADER] ?? '').trim();
    const active = profiles.find((p) => p.id === wanted) ?? profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
    return {
      id: user.id, name: user.name, email: user.email,
      role: active?.role ?? user.role, superAdmin: user.superAdmin,
      profiles, activeProfileId: active?.id ?? null,
    };
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() me: AuthUser, @Res({ passthrough: true }) res: Response) {
    this.block(this.byUser.retryAfterMs(me.id), res);
    try {
      const { token } = await this.auth.changePassword(me.id, dto.currentPassword, dto.newPassword);
      this.byUser.reset(me.id);
      this.session.setCookie(res, token); // this device stays signed in; every other session ends
    } catch (err) {
      this.byUser.fail(me.id);
      throw err;
    }
  }

  /** Check an invite or reset link so the page can greet the person. */
  @Public()
  @Post('link/check')
  @HttpCode(200)
  async checkLink(@Body() dto: LinkTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const key = req.ip ?? 'unknown';
    this.block(this.byLinkAddress.retryAfterMs(key), res);
    try {
      return await this.users.describeLink(dto.token);
    } catch (err) {
      this.byLinkAddress.fail(key);
      throw err;
    }
  }

  /** Use an invite or reset link once: set the password and sign in. */
  @Public()
  @Post('link/accept')
  @HttpCode(200)
  async acceptLink(@Body() dto: AcceptLinkDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const key = req.ip ?? 'unknown';
    this.block(this.byLinkAddress.retryAfterMs(key), res);
    try {
      const user = await this.users.redeemLink(dto.token, dto.password);
      this.session.setCookie(res, await this.session.sign(user));
      return toPublic(user);
    } catch (err) {
      this.byLinkAddress.fail(key);
      throw err;
    }
  }
}
