export class CreateAuditLogDto {
  declare eventType: string;
  userId?: string;
  userRole?: string;
  organizationId?: string | null;
  facilityId?: string | null;
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  result?: string;
  metadata?: Record<string, unknown>;
  errorCode?: string;
}
