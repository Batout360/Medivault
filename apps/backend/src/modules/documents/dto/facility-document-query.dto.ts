import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DocumentTypeEnum } from './upload-document.dto';

/**
 * Filters + pagination for GET /facility/documents — the facility-admin
 * document management dashboard. Scoping to the requesting admin's facility
 * is enforced in the service (never derived from these query params alone).
 */
export class FacilityDocumentQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Free-text patient search (name, MRN, profile ID, phone or email). Resolved against patients in scope.',
  })
  @IsOptional()
  @IsString()
  patient?: string;

  @ApiPropertyOptional({
    description: 'Exact patient UUID. Must belong to the requesting admin’s scope.',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Free-text document search across title, file name, description, notes, source',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: DocumentTypeEnum, description: 'Filter by document category' })
  @IsOptional()
  @IsEnum(DocumentTypeEnum)
  type?: DocumentTypeEnum;

  @ApiPropertyOptional({ description: 'Filter by uploading user UUID' })
  @IsOptional()
  @IsUUID()
  uploadedBy?: string;

  @ApiPropertyOptional({
    description:
      'Org/super admins only: restrict to a specific facility UUID within their organization.',
  })
  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @ApiPropertyOptional({ description: 'Only documents dated on/after this ISO date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Only documents dated on/before this ISO date' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Archive status filter',
    enum: ['active', 'archived', 'all'],
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  status?: 'active' | 'archived' | 'all';
}
