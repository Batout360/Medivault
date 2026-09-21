import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnrollBiometricDto {
  @ApiProperty()
  @IsUUID()
  declare patientId: string;

  @ApiProperty({
    enum: ['FINGERPRINT', 'IRIS', 'FACE', 'PALM_VEIN', 'VOICE', 'RETINA'],
  })
  @IsEnum(['FINGERPRINT', 'IRIS', 'FACE', 'PALM_VEIN', 'VOICE', 'RETINA'])
  declare templateType: string;

  @ApiProperty({
    description: 'Base64-encoded vendor template payload from biometric bridge',
  })
  @IsString()
  @IsNotEmpty()
  declare templatePayload: string;

  @ApiProperty({ description: 'SDK format identifier' })
  @IsString()
  @IsNotEmpty()
  declare format: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  declare quality: number;

  @ApiProperty({ description: 'Hardware device identifier for auditability' })
  @IsString()
  @IsNotEmpty()
  declare deviceId: string;

  @ApiProperty({
    description: 'ISO8601 timestamp from capture device (anti-replay)',
  })
  @IsString()
  @IsNotEmpty()
  declare capturedAt: string;

  @ApiPropertyOptional({
    description: 'HMAC signature from biometric bridge for device auth',
  })
  @IsOptional()
  @IsString()
  bridgeSignature?: string;
}

export class IdentifyBiometricDto {
  @ApiProperty({ description: 'Base64-encoded vendor template payload' })
  @IsString()
  @IsNotEmpty()
  declare templatePayload: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare format: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  declare quality: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare deviceId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare capturedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bridgeSignature?: string;
}

export class VerifyBiometricDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare templatePayload: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare format: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  declare quality: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare deviceId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare capturedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bridgeSignature?: string;
}
