import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@medivault/shared';

/**
 * Metadata key used to store required roles on route handlers.
 * Consumed by RolesGuard.
 */
export const ROLES_KEY = 'roles';

/**
 * Attach required roles to a route or controller.
 *
 * @example
 * \@Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
 * \@Get('admin-only')
 * getAdminData() { … }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
