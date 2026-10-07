import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Partial edit of an existing diagnosis.
 *
 * Every field is optional so a clinician can amend a single detail — say,
 * marking it RESOLVED — without restating the whole record. Omitted keys are
 * left untouched by the service; only the keys present in the body are written.
 */
export class UpdateDiagnosisDto {
  @ApiPropertyOptional({ description: 'ICD-10 / SNOMED code' })
  @IsOptional()
  @IsString()
  diagnosisCode?: string;

  @ApiPropertyOptional({ description: 'Human-readable diagnosis name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  diagnosisName?: string;

  @ApiPropertyOptional({ description: 'Diagnosis type' })
  @IsOptional()
  @IsString()
  diagnosisType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ description: 'Diagnosis status, e.g. RESOLVED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date the diagnosis was made' })
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;
}
