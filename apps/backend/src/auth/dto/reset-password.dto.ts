import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MinLength, MaxLength } from 'class-validator';

const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]{12,128}$/;

const STRONG_PASSWORD_MESSAGE =
  'Password must be 12–128 characters and include at least one uppercase letter, ' +
  'one lowercase letter, one digit, and one special character';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The password reset token received via email' })
  @IsString()
  @MinLength(1)
  declare token: string;

  @ApiProperty({ description: STRONG_PASSWORD_MESSAGE, minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  declare newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  declare currentPassword: string;

  @ApiProperty({ description: STRONG_PASSWORD_MESSAGE, minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  declare newPassword: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  @MinLength(1)
  declare token: string;
}

export class VerifyMfaDto {
  @ApiProperty({ description: '6-digit TOTP code from the authenticator app' })
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  declare code: string;
}
