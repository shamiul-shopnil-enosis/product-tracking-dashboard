import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const IS_PUBLIC_KEY = 'isPublic';
export const MIN_ROLE_KEY = 'minRole';

/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require at least this role (admin > editor > viewer). */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
