import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SelfRegisterAddressDto {
  @ApiPropertyOptional({ example: '12, MG Road' })
  @IsOptional()
  @IsString()
  line1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: '560001' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class SelfRegisterEmergencyContactDto {
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @IsNotEmpty()
  declare name: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @IsNotEmpty()
  declare relationship: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class SelfRegisterAllergyDto {
  @ApiProperty({ example: 'Penicillin' })
  @IsString()
  @IsNotEmpty()
  declare allergen: string;

  @ApiPropertyOptional({ enum: ['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'] })
  @IsOptional()
  @IsString()
  allergyType?: string;

  @ApiPropertyOptional({
    enum: ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reaction?: string;
}

export class SelfRegisterConditionDto {
  @ApiProperty({ example: 'Diabetes mellitus' })
  @IsString()
  @IsNotEmpty()
  declare conditionName: string;

  @ApiPropertyOptional({ example: '2021-03-01' })
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Self-service patient identity payload collected during account registration.
 * When `createPatientIdentity` is true and the role is USER/PATIENT, the backend
 * atomically creates the patient record, medical profile, and QR card alongside
 * the login account.
 */
export class SelfRegisterIdentityDto {
  @ApiPropertyOptional({ example: '1990-05-17', description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] })
  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;

  @ApiPropertyOptional({ enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] })
  @IsOptional()
  @IsEnum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'])
  bloodGroup?: string;

  @ApiPropertyOptional({ type: SelfRegisterAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelfRegisterAddressDto)
  address?: SelfRegisterAddressDto;

  @ApiPropertyOptional({ type: SelfRegisterEmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelfRegisterEmergencyContactDto)
  emergencyContact?: SelfRegisterEmergencyContactDto;

  @ApiPropertyOptional({ type: [SelfRegisterAllergyDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfRegisterAllergyDto)
  allergies?: SelfRegisterAllergyDto[];

  @ApiPropertyOptional({ type: [SelfRegisterConditionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelfRegisterConditionDto)
  conditions?: SelfRegisterConditionDto[];
}

export class RegisterDto {
  @ApiProperty({ example: 'you@hospital.org' })
  @IsEmail()
  declare email: string;

  @ApiProperty({ example: 'dr.smith' })
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

  @ApiPropertyOptional({
    enum: ['USER', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'],
    default: 'USER',
  })
  @IsOptional()
  @IsEnum(['USER', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'])
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description:
      'Set to true (with the identity block populated) to create the full patient ' +
      'identity — patient record, medical profile, and QR card — atomically with the account.',
  })
  @IsOptional()
  @IsBoolean()
  createPatientIdentity?: boolean;

  @ApiPropertyOptional({ type: SelfRegisterIdentityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SelfRegisterIdentityDto)
  identity?: SelfRegisterIdentityDto;
}
