import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, NO_PROFILE_KEY } from '../common/decorators';
import { ProfilesService } from '../profiles/profiles.service';
import { profileStore } from '../profiles/profile-context';

export const PROFILE_HEADER = 'x-profile';

/**
 * Decides which profile this request is about and whether this person may open it, every time (the header is only a request).
 * Sets the role to the one held in that profile, so role checks elsewhere keep working unchanged.
 */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly profiles: ProfilesService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(NO_PROFILE_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const accessible = this.profiles.accessibleTo(req.user);
    const wanted = String(req.headers?.[PROFILE_HEADER] ?? '').trim();
    const chosen = wanted ? accessible.find((p) => p.id === wanted) : (accessible.find((p) => p.isDefault) ?? accessible[0]);
    if (!chosen) throw new ForbiddenException(wanted ? 'You do not have access to this profile' : 'You do not have access to any profile yet. Ask an admin.');

    req.user.role = chosen.role;
    req.user.profileId = chosen.id;
    const store = profileStore.getStore();
    if (store) store.profileId = chosen.id; else profileStore.enterWith({ profileId: chosen.id });
    return true;
  }
}
