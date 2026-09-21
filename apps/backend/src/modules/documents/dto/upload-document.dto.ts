import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DocumentType enum declared here for class-validator and Swagger annotation.
 */
export enum DocumentTypeEnum {
  LAB_REPORT = 'LAB_REPORT',
  IMAGING_REPORT = 'IMAGING_REPORT',
  DIAGNOSTIC_REPORT = 'DIAGNOSTIC_REPORT',
  MEDICAL_REPORT = 'MEDICAL_REPORT',
  PRESCRIPTION = 'PRESCRIPTION',
  DISCHARGE_SUMMARY = 'DISCHARGE_SUMMARY',
  REFERRAL_LETTER = 'REFERRAL_LETTER',
  MEDICAL_CERTIFICATE = 'MEDICAL_CERTIFICATE',
  CONSULTATION_NOTES = 'CONSULTATION_NOTES',
  TREATMENT_PLAN = 'TREATMENT_PLAN',
  CONSENT_FORM = 'CONSENT_FORM',
  INSURANCE_DOCUMENT = 'INSURANCE_DOCUMENT',
  VACCINATION_RECORD = 'VACCINATION_RECORD',
  MEDICAL_HISTORY = 'MEDICAL_HISTORY',
  CLINICAL_NOTE = 'CLINICAL_NOTE',
  OPERATIVE_REPORT = 'OPERATIVE_REPORT',
  PATHOLOGY_REPORT = 'PATHOLOGY_REPORT',
  OTHER = 'OTHER',
}

export class UploadDocumentDto {
  @ApiPropertyOptional({ enum: DocumentTypeEnum, description: 'Clinical document category' })
  @IsOptional()
  @IsEnum(DocumentTypeEnum)
  documentType?: DocumentTypeEnum;

  @ApiPropertyOptional({ description: 'Human-readable title of the record' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Clinical/document date (ISO 8601). Defaults to upload date.',
  })
  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'UUID of the linked medical record encounter' })
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiPropertyOptional({ description: 'Human-readable description of the document' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Name of the external hospital/facility this record originated from',
  })
  @IsOptional()
  @IsString()
  sourceHospital?: string;

  @ApiPropertyOptional({ description: 'Facility the record belongs to (facility UUID)' })
  @IsOptional()
  @IsString()
  facilityId?: string;

  @ApiPropertyOptional({ description: 'Free-text clinical/clerical notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Comma-separated tags for search/filtering' })
  @IsOptional()
  @IsString()
  tags?: string;
}
