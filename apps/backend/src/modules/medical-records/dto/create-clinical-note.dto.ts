import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClinicalNoteDto {
  @ApiProperty({ description: 'Medical record (encounter) UUID this note belongs to' })
  @IsUUID()
  declare medicalRecordId: string;

  @ApiProperty({
    description: 'Note type: SOAP, progress, discharge, referral, etc.',
    example: 'SOAP',
  })
  @IsString()
  @IsNotEmpty()
  declare noteType: string;

  @ApiProperty({ description: 'Full text content of the clinical note' })
  @IsString()
  @IsNotEmpty()
  declare content: string;
}
