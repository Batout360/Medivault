import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcedureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  procedureCode?: string;

  @ApiProperty({ description: 'Descriptive name of the procedure performed' })
  @IsString()
  @IsNotEmpty()
  declare procedureName: string;

  @ApiProperty({ description: 'ISO 8601 datetime the procedure was performed' })
  @IsDateString()
  declare performedAt: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outcome?: string;
}
