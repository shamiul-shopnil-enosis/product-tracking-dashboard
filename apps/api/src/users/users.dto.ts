import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

  /** Profiles the person may open (with this role). */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true })
  profileIds?: string[];

  @IsOptional() @IsBoolean()
  superAdmin?: boolean;
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

  @IsOptional() @IsBoolean()
  superAdmin?: boolean;
}

export class MembershipDto {
  @IsString() @MaxLength(40) profileId: string;
  @IsEnum(Role) role: Role;
}

/** The full list of profiles a person may open. Replaces what they had. */
export class AccessDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => MembershipDto)
  memberships: MembershipDto[];
}
