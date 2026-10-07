import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AllergyDto, MedicalConditionDto } from '../../patients/dto/create-patient.dto';

export enum DiagnosisTypeEnum {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  DIFFERENTIAL = 'DIFFERENTIAL',
  PROVISIONAL = 'PROVISIONAL',
  FINAL = 'FINAL',
  COMORBIDITY = 'COMORBIDITY',
}

export enum DiagnosisStatusEnum {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  CHRONIC = 'CHRONIC',
  INACTIVE = 'INACTIVE',
  RECURRENCE = 'RECURRENCE',
}

export class CreateDiagnosisDto {
  @ApiProperty({ description: 'Medical record (encounter) UUID' })
  @IsUUID()
  declare medicalRecordId: string;

  @ApiPropertyOptional({ description: 'ICD-10 / SNOMED code' })
  @IsOptional()
  @IsString()
  diagnosisCode?: string;

  @ApiProperty({ description: 'Human-readable diagnosis name' })
  @IsString()
  @IsNotEmpty()
  declare diagnosisName: string;

  @ApiPropertyOptional({ description: 'Diagnosis type' })
  @IsOptional()
  @IsString()
  diagnosisType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'Diagnosis status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [MedicalConditionDto],
    description:
      'Medical conditions recorded alongside this diagnosis; pushed onto the patient record',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MedicalConditionDto)
  conditions?: MedicalConditionDto[];

  @ApiPropertyOptional({
    type: [AllergyDto],
    description: 'Allergies recorded alongside this diagnosis; pushed onto the patient record',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AllergyDto)
  allergies?: AllergyDto[];
}
