import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Request } from 'express';
import { AUDIT_EVENT_KEY, AuditEventMetadata } from '../decorators/audit-event.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditEventMetadata>(AUDIT_EVENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    const baseLog = {
      eventType: meta.eventType,
      resourceType: meta.resourceType,
      resourceId: request.params?.id || request.params?.patientId,
      userId: user?.id,
      userRole: user?.role,
      organizationId: user?.organizationId,
      facilityId: user?.facilityId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      sessionId: user?.sessionId,
      requestId: request.requestId,
      action: `${request.method} ${request.path}`,
    };

    return next.handle().pipe(
      tap(() => {
        // Lazy import to avoid circular dep — resolved at runtime
        const auditService = (request as any).auditService;
        if (auditService) {
          auditService.log({ ...baseLog, result: 'SUCCESS' }).catch(() => {});
        }
      }),
      catchError((err) => {
        const auditService = (request as any).auditService;
        if (auditService) {
          auditService
            .log({
              ...baseLog,
              result: 'FAILURE',
              errorCode: err?.status?.toString() || '500',
            })
            .catch(() => {});
        }
        return throwError(() => err);
      }),
    );
  }
}
