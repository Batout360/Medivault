import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]{12,128}$/;

const STRONG_PASSWORD_MESSAGE =
  'Password must be 12–128 characters and include at least one uppercase letter, ' +
  'one lowercase letter, one digit, and one special character';

export class AdminResetPasswordDto {
  @ApiProperty({ description: STRONG_PASSWORD_MESSAGE, minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  declare newPassword: string;
}
