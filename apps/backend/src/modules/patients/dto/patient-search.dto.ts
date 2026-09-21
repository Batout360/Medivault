import { IsOptional, IsString, MinLength, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PatientSearchDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name, MRN, phone, or email (min 3 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mrn?: string;

  @ApiPropertyOptional({ description: '8-character patient profile ID (e.g. AB3XY9KZ)' })
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER'], description: 'Filter by gender' })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @ApiPropertyOptional({
    description: 'Filter by blood group (e.g. A+, O-)',
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  })
  @IsOptional()
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodGroup?: string;
}
