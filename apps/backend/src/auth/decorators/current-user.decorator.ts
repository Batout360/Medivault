import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extracts the authenticated user from the request object.
 * The user is attached by JwtStrategy after successful token validation.
 *
 * @example
 * // Full user object
 * \@Get('me')
 * getMe(\@CurrentUser() user: JwtPayload) { … }
 *
 * // Single field
 * \@Get('my-id')
 * getId(\@CurrentUser('sub') userId: string) { … }
 */
export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user: Record<string, unknown> }).user;

    if (!user) {
      return null;
    }

    return field ? user[field] : user;
  },
);
