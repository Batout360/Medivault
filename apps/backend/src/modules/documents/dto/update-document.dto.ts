import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentTypeEnum } from './upload-document.dto';

/**
 * Metadata update for an existing document. All fields are optional; at least
 * one must be supplied (enforced in the service). Facility, patient, and file
 * identity are immutable and can never be changed through this DTO.
 */
export class UpdateDocumentDto {
  @ApiPropertyOptional({ enum: DocumentTypeEnum, description: 'Re-categorize the document' })
  @IsOptional()
  @IsEnum(DocumentTypeEnum)
  documentType?: DocumentTypeEnum;

  @ApiPropertyOptional({ description: 'Human-readable title of the record' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Clinical/document date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  documentDate?: string;

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

  @ApiPropertyOptional({ description: 'Free-text clinical/clerical notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
