import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ enum: DiagnosisTypeEnum })
  @IsEnum(DiagnosisTypeEnum)
  declare diagnosisType: DiagnosisTypeEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ enum: DiagnosisStatusEnum })
  @IsOptional()
  @IsEnum(DiagnosisStatusEnum)
  status?: DiagnosisStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
