/**
 * Categories of auditable events
 */
export type AuditEventCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DATA_ACCESS'
  | 'DATA_MODIFICATION'
  | 'DATA_DELETION'
  | 'EXPORT'
  | 'PRINT'
  | 'BIOMETRIC'
  | 'SYSTEM'
  | 'SECURITY'
  | 'ADMIN';

/**
 * Specific audit event types
 */
export type AuditEventType =
  // Auth events
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_CHALLENGE'
  | 'SESSION_EXPIRED'
  | 'TOKEN_REFRESHED'
  // Patient events
  | 'PATIENT_CREATED'
  | 'PATIENT_UPDATED'
  | 'PATIENT_DELETED'
  | 'PATIENT_SEARCHED'
  | 'PATIENT_VIEWED'
  | 'PATIENT_EXPORTED'
  // Medical record events
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'RECORD_VIEWED'
  | 'RECORD_PRINTED'
  | 'RECORD_EXPORTED'
  | 'RECORD_SHARED'
  // Biometric events
  | 'BIOMETRIC_ENROLLED'
  | 'BIOMETRIC_IDENTIFIED'
  | 'BIOMETRIC_VERIFIED'
  | 'BIOMETRIC_DELETED'
  | 'BIOMETRIC_FAILED'
  // User management
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_PERMISSION_CHANGED'
  // System events
  | 'SYSTEM_CONFIG_CHANGED'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'INTEGRATION_CALLED'
  // Security events
  | 'SUSPICIOUS_ACTIVITY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'DATA_BREACH_DETECTED'
  | 'IP_BLOCKED';

/**
 * Resource types that can be audited
 */
export type ResourceType =
  | 'USER'
  | 'PATIENT'
  | 'MEDICAL_RECORD'
  | 'PRESCRIPTION'
  | 'LAB_REPORT'
  | 'DIAGNOSIS'
  | 'VITAL'
  | 'CLINICAL_NOTE'
  | 'BIOMETRIC_TEMPLATE'
  | 'DOCUMENT'
  | 'ORGANIZATION'
  | 'FACILITY'
  | 'SYSTEM_CONFIG';

/**
 * Audit operation result
 */
export type AuditResult = 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'DENIED';

/**
 * Core audit log entry — immutable record of every system action
 */
export interface AuditLog {
  id: string;
  eventType: AuditEventType;
  category: AuditEventCategory;
  userId: string | null;           // null for system-generated events
  userEmail?: string;
  userRole?: string;
  resourceType: ResourceType;
  resourceId: string;
  organizationId: string;
  facilityId: string | null;
  ipAddress: string;
  userAgent: string;
  sessionId: string | null;
  result: AuditResult;
  metadata: AuditMetadata;
  riskScore?: number;              // 0-100 anomaly detection score
  createdAt: Date;
}

/**
 * Structured metadata for audit logs — varies by event type
 */
export interface AuditMetadata {
  // HTTP context
  httpMethod?: string;
  httpPath?: string;
  statusCode?: number;
  responseTimeMs?: number;
  // Change tracking
  changedFields?: string[];
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  // Search context
  searchQuery?: string;
  resultCount?: number;
  // Export context
  exportFormat?: string;
  recordCount?: number;
  // Error context
  errorCode?: string;
  errorMessage?: string;
  stackTrace?: string;
  // Geographic context
  country?: string;
  region?: string;
  city?: string;
  // Additional context
  reason?: string;
  notes?: string;
  [key: string]: unknown;
}

/**
 * Audit event (in-flight, before persisting to log)
 */
export interface AuditEvent {
  eventType: AuditEventType;
  category: AuditEventCategory;
  userId: string | null;
  resourceType: ResourceType;
  resourceId: string;
  organizationId: string;
  facilityId?: string;
  result: AuditResult;
  metadata?: Partial<AuditMetadata>;
  riskScore?: number;
}

/**
 * Security event — high-severity events requiring immediate attention
 */
export interface SecurityEvent extends AuditLog {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  alertSent: boolean;
  alertSentAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  relatedEventIds?: string[];
  incidentId?: string;
}

/**
 * Query parameters for searching audit logs
 */
export interface AuditLogSearchParams {
  userId?: string;
  eventType?: AuditEventType | AuditEventType[];
  category?: AuditEventCategory;
  resourceType?: ResourceType;
  resourceId?: string;
  organizationId?: string;
  facilityId?: string;
  result?: AuditResult;
  ipAddress?: string;
  sessionId?: string;
  fromDate?: string;
  toDate?: string;
  minRiskScore?: number;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'riskScore' | 'userId';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated audit log response
 */
export interface PaginatedAuditLogs {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
