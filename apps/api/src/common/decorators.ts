import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const IS_PUBLIC_KEY = 'isPublic';
export const MIN_ROLE_KEY = 'minRole';
export const NO_PROFILE_KEY = 'noProfile';
export const SUPER_ADMIN_KEY = 'superAdminOnly';

/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require at least this role (admin > editor > viewer). */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

/** This route is not about one profile (profile list, user administration), so no profile is chosen for it. */
export const NoProfile = () => SetMetadata(NO_PROFILE_KEY, true);

/** Only super admins: the people who create profiles, manage keys and decide who gets access. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);

export interface Membership { profileId: string; role: Role }

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** The role in the active profile (admin for super admins). */
  role: Role;
  superAdmin: boolean;
  memberships: Membership[];
  profileId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
