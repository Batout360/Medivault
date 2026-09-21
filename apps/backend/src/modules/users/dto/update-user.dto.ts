import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

const USERNAME_REGEX = /^[a-z0-9._-]+$/i;
const USERNAME_MESSAGE =
  'Username may only contain letters, numbers, dots, dashes, and underscores';

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;

  @ApiPropertyOptional({
    description: 'New sign-in username for the user',
    minLength: 3,
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must be 30 characters or fewer' })
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username?: string;

  @ApiPropertyOptional({
    description: 'New sign-in email address for the user',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({
    enum: ALL_ROLES,
    description: 'Assign a new role to the user',
  })
  @IsOptional()
  @IsEnum(ALL_ROLES)
  role?: string;

  @ApiPropertyOptional({
    description: 'Facility UUID the user belongs to',
  })
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

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional({
    description: 'Hospital / clinic where you work',
  })
  @IsOptional()
  @IsString()
  hospital?: string;
}
