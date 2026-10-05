import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionRouteEnum } from './create-prescription.dto';

/**
 * Partial edit of an existing prescription.
 *
 * Every field is optional so a clinician can amend a single detail (say, the
 * duration) without restating the whole order. Omitted keys are left untouched
 * by the service — only the keys actually present in the body are written.
 */
export class UpdatePrescriptionDto {
  @ApiPropertyOptional({ description: 'Brand/trade medication name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  medicationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional({ description: 'Dose amount and unit, e.g. "500 mg"' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Dosing frequency, e.g. "twice daily"' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  frequency?: string;

  @ApiPropertyOptional({ enum: PrescriptionRouteEnum })
  @IsOptional()
  @IsEnum(PrescriptionRouteEnum)
  route?: PrescriptionRouteEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refills?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'When the pharmacy handed the drug over' })
  @IsOptional()
  @IsDateString()
  dispensedAt?: string;

  /**
   * Ends the prescription (false) or puts a previously ended one back on the
   * patient's medication list (true). Either way the service also writes
   * `endedAt` / `endReason` so the flag and the trail describing it stay in
   * step — prefer the dedicated `/end` endpoint when a reason should be kept.
   */
  @ApiPropertyOptional({ description: 'Whether the prescription is still being taken' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Why a clinician stopped a prescription.
 *
 * Kept separate from {@link UpdatePrescriptionDto} because ending is a clinically
 * meaningful event that deserves its own audited route and an explicit note.
 */
export class EndPrescriptionDto {
  @ApiPropertyOptional({ description: 'Why the prescription was stopped' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date the course ended' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;
}