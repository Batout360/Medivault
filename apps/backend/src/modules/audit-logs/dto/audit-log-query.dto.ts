import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AuditLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Free-text search across event, action, user, resource',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'View preset — `security` narrows to resourceType=SECURITY events',
    enum: ['all', 'security'],
  })
  @IsOptional()
  @IsIn(['all', 'security'])
  type?: 'all' | 'security';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** End-date alias used by the frontend date-pickers */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  /** End-date alias used by the frontend date-pickers */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL'])
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED' | 'PARTIAL';
}
