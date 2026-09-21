import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentTypeEnum } from './upload-document.dto';

/**
 * Query filters + search for the GET /patients/:patientId/documents endpoint.
 */
export class DocumentQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search across title, file name, description, source',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: DocumentTypeEnum, description: 'Filter by document category' })
  @IsOptional()
  @IsEnum(DocumentTypeEnum)
  type?: DocumentTypeEnum;

  @ApiPropertyOptional({ description: 'Filter by source hospital / facility name' })
  @IsOptional()
  @IsString()
  facility?: string;

  @ApiPropertyOptional({ description: 'Filter by uploading user UUID' })
  @IsOptional()
  @IsUUID()
  uploadedBy?: string;

  @ApiPropertyOptional({ description: 'Only documents dated on/after this ISO date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Only documents dated on/before this ISO date' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Sort field: createdAt (default) or documentDate' })
  @IsOptional()
  @Matches(/^(createdAt|documentDate)$/)
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction: asc or desc' })
  @IsOptional()
  @Matches(/^(asc|desc)$/)
  order?: 'asc' | 'desc';
}
