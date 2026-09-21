import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateImagingReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;

  @ApiProperty({ description: 'Imaging modality, e.g. X-Ray, CT, MRI, Ultrasound' })
  @IsString()
  @IsNotEmpty()
  declare imagingType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bodyPart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  indication?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  findings?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  impression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  radiologistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportDate?: string;
}
