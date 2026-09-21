import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Triggers the Passport refresh-token strategy.
 * Used exclusively on POST /auth/refresh.
 *
 * Reads the refresh_token from the httpOnly cookie, validates its SHA-256
 * hash against the database, and attaches the user payload to the request.
 */
@Injectable()
export class RefreshTokenGuard extends AuthGuard('refresh-token') {
  handleRequest<TUser>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired refresh token. Please sign in again.');
    }
    return user;
  }
}
