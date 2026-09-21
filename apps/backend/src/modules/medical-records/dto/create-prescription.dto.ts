import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PrescriptionRouteEnum {
  ORAL = 'ORAL',
  INTRAVENOUS = 'INTRAVENOUS',
  INTRAMUSCULAR = 'INTRAMUSCULAR',
  SUBCUTANEOUS = 'SUBCUTANEOUS',
  TOPICAL = 'TOPICAL',
  INHALATION = 'INHALATION',
  SUBLINGUAL = 'SUBLINGUAL',
  RECTAL = 'RECTAL',
  OPHTHALMIC = 'OPHTHALMIC',
  OTIC = 'OTIC',
  NASAL = 'NASAL',
  TRANSDERMAL = 'TRANSDERMAL',
  OTHER = 'OTHER',
}

export class CreatePrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiProperty({ description: 'Brand/trade medication name' })
  @IsString()
  @IsNotEmpty()
  declare medicationName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiProperty({ description: 'Dose amount and unit, e.g. "500 mg"' })
  @IsString()
  @IsNotEmpty()
  declare dosage: string;

  @ApiProperty({ description: 'Dosing frequency, e.g. "twice daily"' })
  @IsString()
  @IsNotEmpty()
  declare frequency: string;

  @ApiProperty({ enum: PrescriptionRouteEnum })
  @IsEnum(PrescriptionRouteEnum)
  declare route: PrescriptionRouteEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refills?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
