import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVisibilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPhoto?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBloodType?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAllergies?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showConditions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showEmergencyContact?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showMedications?: boolean;
}
