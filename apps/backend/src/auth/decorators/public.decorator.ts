import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to mark routes as public (no JWT required).
 * Consumed by JwtAuthGuard.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route or controller as publicly accessible, bypassing the global
 * JWT authentication guard.
 *
 * @example
 * \@Public()
 * \@Post('login')
 * login(\@Body() dto: LoginDto) { … }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
