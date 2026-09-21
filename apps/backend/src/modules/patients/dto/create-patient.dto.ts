import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum BloodGroup {
  A_POSITIVE = 'A_POSITIVE',
  A_NEGATIVE = 'A_NEGATIVE',
  B_POSITIVE = 'B_POSITIVE',
  B_NEGATIVE = 'B_NEGATIVE',
  AB_POSITIVE = 'AB_POSITIVE',
  AB_NEGATIVE = 'AB_NEGATIVE',
  O_POSITIVE = 'O_POSITIVE',
  O_NEGATIVE = 'O_NEGATIVE',
  UNKNOWN = 'UNKNOWN',
}

export class AddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare line1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare state: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare country: string;
}

export class EmergencyContactDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare relationship: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'Phone must be in E.164 format, e.g. +911234567890' })
  declare phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class AllergyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare allergen: string;

  @ApiPropertyOptional({ enum: ['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'] })
  @IsOptional()
  @IsIn(['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'])
  allergyType?: string;

  @ApiPropertyOptional({ enum: ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING'] })
  @IsOptional()
  @IsIn(['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING'])
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reaction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MedicalConditionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare conditionName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditionCode?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'RESOLVED', 'CHRONIC', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'RESOLVED', 'CHRONIC', 'INACTIVE'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePatientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiProperty({ example: '1990-06-15' })
  @IsDateString()
  declare dateOfBirth: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  declare gender: Gender;

  @ApiPropertyOptional({ enum: BloodGroup })
  @IsOptional()
  @IsEnum(BloodGroup)
  bloodGroup?: BloodGroup;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'Phone must be in E.164 format' })
  declare phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiProperty()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  declare emergencyContact: EmergencyContactDto;

  @ApiPropertyOptional({ type: [AllergyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyDto)
  allergies?: AllergyDto[];

  @ApiPropertyOptional({ type: [MedicalConditionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicalConditionDto)
  conditions?: MedicalConditionDto[];

  @ApiPropertyOptional({
    description: 'UUID of the linked user account (same person). Omit to auto-link by email.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
