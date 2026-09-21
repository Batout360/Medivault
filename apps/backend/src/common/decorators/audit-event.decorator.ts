import { SetMetadata } from '@nestjs/common';

export const AUDIT_EVENT_KEY = 'auditEvent';

export interface AuditEventMetadata {
  eventType: string;
  resourceType: string;
}

export const AuditEvent = (eventType: string, resourceType: string) =>
  SetMetadata(AUDIT_EVENT_KEY, { eventType, resourceType } as AuditEventMetadata);
