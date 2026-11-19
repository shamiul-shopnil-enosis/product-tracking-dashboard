import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../common/roles';

export const MIN_PASSWORD_LENGTH = 10;

export class CreateUserDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name: string;

  @IsEmail() @MaxLength(200)
  email: string;

  @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(200)
  password: string;

  @IsEnum(Role)
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

export class ResetPasswordDto {
  @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(200)
  password: string;
}
