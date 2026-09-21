import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLabReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiProperty({ description: 'Name of the laboratory test' })
  @IsString()
  @IsNotEmpty()
  declare testName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  results?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normalRange?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interpretation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  labName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
