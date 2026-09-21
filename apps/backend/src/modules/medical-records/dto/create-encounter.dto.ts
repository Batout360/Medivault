import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EncounterTypeEnum {
  OUTPATIENT = 'OUTPATIENT',
  INPATIENT = 'INPATIENT',
  EMERGENCY = 'EMERGENCY',
  TELEHEALTH = 'TELEHEALTH',
  HOME_VISIT = 'HOME_VISIT',
  DAY_SURGERY = 'DAY_SURGERY',
  ICU = 'ICU',
  OTHER = 'OTHER',
}

export class CreateEncounterDto {
  @ApiPropertyOptional({ description: 'Patient UUID' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Facility UUID' })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiProperty({ enum: EncounterTypeEnum })
  @IsEnum(EncounterTypeEnum)
  declare encounterType: EncounterTypeEnum;

  @ApiProperty({ description: 'ISO 8601 date of encounter' })
  @IsDateString()
  declare encounterDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historyOfPresentIllness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physicalExam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assessment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}

export class UpdateEncounterDto {
  @ApiPropertyOptional({ enum: EncounterTypeEnum })
  @IsOptional()
  @IsEnum(EncounterTypeEnum)
  encounterType?: EncounterTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  encounterDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historyOfPresentIllness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physicalExam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assessment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}
