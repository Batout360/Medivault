import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '@medivault/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

/**
 * Role-based access control guard.
 *
 * Reads the required roles from @Roles() decorator metadata and checks them
 * against the authenticated user's role.
 *
 * Must be used after JwtAuthGuard (the user must already be authenticated).
 *
 * @example
 * \@UseGuards(JwtAuthGuard, RolesGuard)
 * \@Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
 * \@Delete(':id')
 * deleteUser() { … }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — route is accessible by any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user: JwtPayload }).user;

    if (!user) {
      throw new ForbiddenException('No authenticated user found on the request');
    }

    const hasRole = requiredRoles.includes(user.role as UserRole);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required role(s): ${requiredRoles.join(', ')}. ` +
          `Your role: ${user.role}.`,
      );
    }

    return true;
  }
}
