import { IsOptional, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Optional payload for generating / regenerating a medical profile QR code.
 */
export class GenerateQrDto {
  /**
   * Origin (e.g. http://localhost:3000) the verification URL should resolve
   * against. When omitted the backend falls back to the default frontend
   * origin from configuration.
   */
  @ApiPropertyOptional({
    description: 'Frontend origin used to build the /verify/<token> payload URL',
    example: 'http://localhost:3000',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  baseUrl?: string;
}
