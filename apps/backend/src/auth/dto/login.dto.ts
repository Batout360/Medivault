import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'User email address', format: 'email' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  declare email: string;

  @ApiProperty({ description: 'User password', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  declare password: string;

  @ApiPropertyOptional({ description: '6-digit TOTP code (required when MFA is enabled)' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;

  @ApiPropertyOptional({ description: 'Client device identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Keep session alive longer (client hint only)' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
