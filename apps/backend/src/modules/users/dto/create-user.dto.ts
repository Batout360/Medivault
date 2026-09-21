import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'FACILITY_ADMIN',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'RECEPTIONIST',
  'BILLING_STAFF',
  'USER',
  'PATIENT',
  'AUDITOR',
] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'dr.smith@hospital.example.com' })
  @IsEmail()
  declare email: string;

  @ApiProperty({ example: 'drsmith' })
  @IsString()
  @IsNotEmpty()
  declare username: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  declare password: string;

  @ApiProperty({ example: 'Sarah' })
  @IsString()
  @IsNotEmpty()
  declare firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  declare lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ALL_ROLES })
  @IsEnum(ALL_ROLES)
  declare role: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({
    description: 'Hospital / clinic where the user works',
  })
  @IsOptional()
  @IsString()
  hospital?: string;
}
