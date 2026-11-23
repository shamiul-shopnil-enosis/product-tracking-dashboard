import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../users/users.dto';

export class LoginDto {
  @IsEmail() @MaxLength(200)
  email: string;

  @IsString() @MaxLength(200)
  password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200)
  currentPassword: string;

  @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(200)
  newPassword: string;
}

export class LinkTokenDto {
  @IsString() @MinLength(20) @MaxLength(100)
  token: string;
}

export class AcceptLinkDto extends LinkTokenDto {
  @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(200)
  password: string;
}
