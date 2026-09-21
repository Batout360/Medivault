import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DownloadDisposition } from '../storage/storage.provider';

/**
 * Query params for the GET …/documents/:documentId/download-url endpoint.
 */
export class DownloadDocumentQueryDto {
  @ApiPropertyOptional({
    enum: ['inline', 'attachment'],
    description: 'inline = open in browser tab, attachment = force download. Default: attachment',
  })
  @IsOptional()
  @IsEnum(['inline', 'attachment'])
  mode?: DownloadDisposition;
}
