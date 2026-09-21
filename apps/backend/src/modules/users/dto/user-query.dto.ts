import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;

  @ApiPropertyOptional({
    enum: [
      'SUPER_ADMIN',
      'ORG_ADMIN',
      'FACILITY_ADMIN',
      'DOCTOR',
      'NURSE',
      'PHARMACIST',
      'LAB_TECHNICIAN',
      'RADIOLOGIST',
      'RECEPTIONIST',
      'BILLING_STAFF',
      'USER',
      'PATIENT',
      'AUDITOR',
    ],
  })
  @IsOptional()
  @IsEnum([
    'SUPER_ADMIN',
    'ORG_ADMIN',
    'FACILITY_ADMIN',
    'DOCTOR',
    'NURSE',
    'PHARMACIST',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'RECEPTIONIST',
    'BILLING_STAFF',
    'USER',
    'PATIENT',
    'AUDITOR',
  ])
  role?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() facilityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() isActive?: string;
}
