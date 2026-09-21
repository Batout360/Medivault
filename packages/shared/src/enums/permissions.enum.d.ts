import { UserRole } from './roles.enum';
/**
 * Granular permissions for fine-grained access control.
 * These can be assigned per-role or overridden per-user.
 */
export declare enum Permission {
    PATIENT_CREATE = "patient:create",
    PATIENT_READ = "patient:read",
    PATIENT_UPDATE = "patient:update",
    PATIENT_DELETE = "patient:delete",
    PATIENT_SEARCH = "patient:search",
    PATIENT_EXPORT = "patient:export",
    PATIENT_MERGE = "patient:merge",// Merge duplicate records
    PATIENT_TRANSFER = "patient:transfer",// Transfer between facilities
    MEDICAL_RECORD_CREATE = "medical_record:create",
    MEDICAL_RECORD_READ = "medical_record:read",
    MEDICAL_RECORD_UPDATE = "medical_record:update",
    MEDICAL_RECORD_DELETE = "medical_record:delete",
    MEDICAL_RECORD_SIGN = "medical_record:sign",
    MEDICAL_RECORD_EXPORT = "medical_record:export",
    MEDICAL_RECORD_PRINT = "medical_record:print",
    MEDICAL_RECORD_SHARE = "medical_record:share",
    DIAGNOSIS_CREATE = "diagnosis:create",
    DIAGNOSIS_READ = "diagnosis:read",
    DIAGNOSIS_UPDATE = "diagnosis:update",
    DIAGNOSIS_DELETE = "diagnosis:delete",
    PRESCRIPTION_CREATE = "prescription:create",
    PRESCRIPTION_READ = "prescription:read",
    PRESCRIPTION_UPDATE = "prescription:update",
    PRESCRIPTION_DELETE = "prescription:delete",
    PRESCRIPTION_DISPENSE = "prescription:dispense",
    LAB_REPORT_CREATE = "lab_report:create",
    LAB_REPORT_READ = "lab_report:read",
    LAB_REPORT_UPDATE = "lab_report:update",
    LAB_REPORT_DELETE = "lab_report:delete",
    LAB_REPORT_VERIFY = "lab_report:verify",
    VITAL_CREATE = "vital:create",
    VITAL_READ = "vital:read",
    VITAL_UPDATE = "vital:update",
    VITAL_DELETE = "vital:delete",
    BIOMETRIC_ENROLL = "biometric:enroll",
    BIOMETRIC_IDENTIFY = "biometric:identify",
    BIOMETRIC_VERIFY = "biometric:verify",
    BIOMETRIC_DELETE = "biometric:delete",
    BIOMETRIC_VIEW_STATUS = "biometric:view_status",
    BIOMETRIC_DEVICE_MANAGE = "biometric:device_manage",
    DOCUMENT_UPLOAD = "document:upload",
    DOCUMENT_READ = "document:read",
    DOCUMENT_DELETE = "document:delete",
    DOCUMENT_SHARE = "document:share",
    AUDIT_LOG_READ = "audit_log:read",
    AUDIT_LOG_EXPORT = "audit_log:export",
    SECURITY_EVENT_READ = "security_event:read",
    SECURITY_EVENT_ACKNOWLEDGE = "security_event:acknowledge",
    USER_CREATE = "user:create",
    USER_READ = "user:read",
    USER_UPDATE = "user:update",
    USER_DELETE = "user:delete",
    USER_MANAGE = "user:manage",// Umbrella: includes create/read/update/delete
    USER_IMPERSONATE = "user:impersonate",// Super admin only
    ROLE_READ = "role:read",
    ROLE_MANAGE = "role:manage",
    PERMISSION_MANAGE = "permission:manage",
    ORGANIZATION_READ = "organization:read",
    ORGANIZATION_MANAGE = "organization:manage",
    FACILITY_READ = "facility:read",
    FACILITY_MANAGE = "facility:manage",
    SYSTEM_CONFIG = "system:config",
    SYSTEM_BACKUP = "system:backup",
    SYSTEM_RESTORE = "system:restore",
    INTEGRATION_MANAGE = "integration:manage",
    REPORT_GENERATE = "report:generate",
    ANALYTICS_VIEW = "analytics:view"
}
/**
 * Default permission sets for each role.
 * Used to seed the database and for documentation.
 * Actual enforcement is done in the backend permission guards.
 */
export declare const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]>;
//# sourceMappingURL=permissions.enum.d.ts.map