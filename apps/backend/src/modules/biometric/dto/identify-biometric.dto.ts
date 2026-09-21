import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IdentifyBiometricDto {
  @ApiProperty({
    description: 'Base64-encoded biometric template payload from vendor SDK',
  })
  @IsString()
  @IsNotEmpty()
  declare templatePayload: string;

  @ApiProperty({ description: 'Format identifier for the vendor SDK' })
  @IsString()
  @IsNotEmpty()
  declare format: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  declare quality: number;

  @ApiProperty({ description: 'Device hardware ID for auditability' })
  @IsString()
  @IsNotEmpty()
  declare deviceId: string;

  @ApiProperty({
    description: 'Timestamp from the capture device (anti-replay)',
  })
  @IsString()
  @IsNotEmpty()
  declare capturedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bridgeSignature?: string;
}
