import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@medivault/shared';

export class UserInfoDto {
  @ApiProperty({ description: 'User UUID' })
  declare id: string;

  @ApiProperty({ description: 'Email address' })
  declare email: string;

  @ApiProperty({ description: 'Username (login handle)' })
  declare username: string;

  @ApiProperty({ description: 'First name' })
  declare firstName: string;

  @ApiProperty({ description: 'Last name' })
  declare lastName: string;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  declare role: UserRole;

  @ApiProperty({ description: 'Whether the email has been verified' })
  declare isEmailVerified: boolean;

  @ApiProperty({ description: 'Whether MFA is enabled for this account' })
  declare isMfaEnabled: boolean;

  @ApiProperty({ description: 'Organisation UUID', nullable: true })
  declare organizationId: string | null;

  @ApiProperty({ description: 'Facility UUID (nullable)', nullable: true })
  declare facilityId: string | null;

  @ApiProperty({ description: 'Hospital / clinic the user works at', nullable: true })
  declare hospital: string | null;

  @ApiProperty({ description: 'Last successful login timestamp', nullable: true })
  declare lastLoginAt: Date | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  declare accessToken: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  declare tokenType: 'Bearer';

  @ApiProperty({ description: 'Seconds until the access token expires', example: 900 })
  declare expiresIn: number;

  @ApiProperty({ type: UserInfoDto })
  declare user: UserInfoDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  declare message: string;
}

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'otpauth:// URI for QR code' })
  declare otpauthUrl: string;

  @ApiProperty({ description: 'Base32-encoded TOTP secret' })
  declare secret: string;

  @ApiProperty({ description: 'QR code as a data URL (data:image/png;base64,…)' })
  declare qrCodeDataUrl: string;

  @ApiProperty({ description: 'Instructional message for the user' })
  declare message: string;
}

export class SessionInfoDto {
  @ApiProperty()
  declare id: string;

  @ApiProperty()
  declare createdAt: Date;

  @ApiProperty()
  declare lastUsedAt: Date;

  @ApiProperty()
  declare expiresAt: Date;

  @ApiProperty({ nullable: true })
  declare ipAddress: string | null;

  @ApiProperty({ nullable: true })
  declare userAgent: string | null;

  @ApiProperty()
  declare isCurrent: boolean;
}
