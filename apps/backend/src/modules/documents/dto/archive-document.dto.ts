import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Archive / unarchive a document. `true` moves the document into the archived
 * state (hidden from the active list but retained for compliance); `false`
 * restores it.
 */
export class ArchiveDocumentDto {
  @ApiProperty({
    description: 'true = archive, false = restore from archive',
    example: true,
  })
  @IsBoolean()
  archived!: boolean;
}
