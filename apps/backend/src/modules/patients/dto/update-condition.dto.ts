import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CONDITION_STATUSES = ['ACTIVE', 'RESOLVED', 'CHRONIC', 'INACTIVE'] as const;

export class UpdateConditionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  conditionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  conditionCode?: string;

  @ApiPropertyOptional({ enum: CONDITION_STATUSES })
  @IsOptional()
  @IsIn(CONDITION_STATUSES)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
