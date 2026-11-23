import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../common/roles';

export const MIN_PASSWORD_LENGTH = 10;

/** Admin adds a person by name, email and role. They choose their own password through an invite link. */
export class InviteUserDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name: string;

  @IsEmail() @MaxLength(200)
  email: string;

  @IsEnum(Role)
  role: Role;
}

/** Internal shape used for the first admin created from the environment. */
export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  name?: string;

  @IsOptional() @IsEnum(Role)
  role?: Role;

  @IsOptional() @IsBoolean()
  active?: boolean;
}
