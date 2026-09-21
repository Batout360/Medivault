import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new ForbiddenException('Access denied.');
    }

    // SUPER_ADMIN bypasses org isolation
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // Extract target org from various request locations
    const targetOrgId =
      request.params?.organizationId ||
      request.query?.organizationId ||
      (request.body as any)?.organizationId;

    // If no org specified in request, allow and let service enforce isolation
    if (!targetOrgId) {
      return true;
    }

    if (user.organizationId !== targetOrgId) {
      throw new ForbiddenException('You do not have access to resources in this organization.');
    }

    return true;
  }
}
