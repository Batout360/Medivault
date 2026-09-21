import { UserRole } from './roles.enum';

/**
 * Granular permissions for fine-grained access control.
 * These can be assigned per-role or overridden per-user.
 */
export enum Permission {
  // ─── Patient Permissions ─────────────────────────────────────────────────
  PATIENT_CREATE = 'patient:create',
  PATIENT_READ = 'patient:read',
  PATIENT_UPDATE = 'patient:update',
  PATIENT_DELETE = 'patient:delete',
  PATIENT_SEARCH = 'patient:search',
  PATIENT_EXPORT = 'patient:export',
  PATIENT_MERGE = 'patient:merge',           // Merge duplicate records
  PATIENT_TRANSFER = 'patient:transfer',     // Transfer between facilities

  // ─── Medical Record Permissions ──────────────────────────────────────────
  MEDICAL_RECORD_CREATE = 'medical_record:create',
  MEDICAL_RECORD_READ = 'medical_record:read',
  MEDICAL_RECORD_UPDATE = 'medical_record:update',
  MEDICAL_RECORD_DELETE = 'medical_record:delete',
  MEDICAL_RECORD_SIGN = 'medical_record:sign',
  MEDICAL_RECORD_EXPORT = 'medical_record:export',
  MEDICAL_RECORD_PRINT = 'medical_record:print',
  MEDICAL_RECORD_SHARE = 'medical_record:share',

  // ─── Diagnosis Permissions ───────────────────────────────────────────────
  DIAGNOSIS_CREATE = 'diagnosis:create',
  DIAGNOSIS_READ = 'diagnosis:read',
  DIAGNOSIS_UPDATE = 'diagnosis:update',
  DIAGNOSIS_DELETE = 'diagnosis:delete',

  // ─── Prescription Permissions ────────────────────────────────────────────
  PRESCRIPTION_CREATE = 'prescription:create',
  PRESCRIPTION_READ = 'prescription:read',
  PRESCRIPTION_UPDATE = 'prescription:update',
  PRESCRIPTION_DELETE = 'prescription:delete',
  PRESCRIPTION_DISPENSE = 'prescription:dispense',

  // ─── Lab Report Permissions ──────────────────────────────────────────────
  LAB_REPORT_CREATE = 'lab_report:create',
  LAB_REPORT_READ = 'lab_report:read',
  LAB_REPORT_UPDATE = 'lab_report:update',
  LAB_REPORT_DELETE = 'lab_report:delete',
  LAB_REPORT_VERIFY = 'lab_report:verify',

  // ─── Vital Signs Permissions ─────────────────────────────────────────────
  VITAL_CREATE = 'vital:create',
  VITAL_READ = 'vital:read',
  VITAL_UPDATE = 'vital:update',
  VITAL_DELETE = 'vital:delete',

  // ─── Biometric Permissions ───────────────────────────────────────────────
  BIOMETRIC_ENROLL = 'biometric:enroll',
  BIOMETRIC_IDENTIFY = 'biometric:identify',
  BIOMETRIC_VERIFY = 'biometric:verify',
  BIOMETRIC_DELETE = 'biometric:delete',
  BIOMETRIC_VIEW_STATUS = 'biometric:view_status',
  BIOMETRIC_DEVICE_MANAGE = 'biometric:device_manage',

  // ─── Document Permissions ────────────────────────────────────────────────
  DOCUMENT_UPLOAD = 'document:upload',
  DOCUMENT_READ = 'document:read',
  DOCUMENT_DELETE = 'document:delete',
  DOCUMENT_SHARE = 'document:share',

  // ─── Audit Log Permissions ───────────────────────────────────────────────
  AUDIT_LOG_READ = 'audit_log:read',
  AUDIT_LOG_EXPORT = 'audit_log:export',
  SECURITY_EVENT_READ = 'security_event:read',
  SECURITY_EVENT_ACKNOWLEDGE = 'security_event:acknowledge',

  // ─── User Management Permissions ────────────────────────────────────────
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_MANAGE = 'user:manage',           // Umbrella: includes create/read/update/delete
  USER_IMPERSONATE = 'user:impersonate', // Super admin only

  // ─── Role & Permission Management ───────────────────────────────────────
  ROLE_READ = 'role:read',
  ROLE_MANAGE = 'role:manage',
  PERMISSION_MANAGE = 'permission:manage',

  // ─── Organization & Facility Management ─────────────────────────────────
  ORGANIZATION_READ = 'organization:read',
  ORGANIZATION_MANAGE = 'organization:manage',
  FACILITY_READ = 'facility:read',
  FACILITY_MANAGE = 'facility:manage',

  // ─── System Configuration ────────────────────────────────────────────────
  SYSTEM_CONFIG = 'system:config',
  SYSTEM_BACKUP = 'system:backup',
  SYSTEM_RESTORE = 'system:restore',
  INTEGRATION_MANAGE = 'integration:manage',
  REPORT_GENERATE = 'report:generate',
  ANALYTICS_VIEW = 'analytics:view',
}

/**
 * Default permission sets for each role.
 * Used to seed the database and for documentation.
 * Actual enforcement is done in the backend permission guards.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),

  [UserRole.ORG_ADMIN]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_DELETE,
    Permission.PATIENT_SEARCH,
    Permission.PATIENT_EXPORT,
    Permission.MEDICAL_RECORD_READ,
    Permission.MEDICAL_RECORD_EXPORT,
    Permission.MEDICAL_RECORD_PRINT,
    Permission.BIOMETRIC_ENROLL,
    Permission.BIOMETRIC_IDENTIFY,
    Permission.BIOMETRIC_VERIFY,
    Permission.BIOMETRIC_DELETE,
    Permission.BIOMETRIC_VIEW_STATUS,
    Permission.BIOMETRIC_DEVICE_MANAGE,
    Permission.AUDIT_LOG_READ,
    Permission.AUDIT_LOG_EXPORT,
    Permission.SECURITY_EVENT_READ,
    Permission.SECURITY_EVENT_ACKNOWLEDGE,
    Permission.USER_MANAGE,
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.ROLE_READ,
    Permission.ROLE_MANAGE,
    Permission.FACILITY_READ,
    Permission.FACILITY_MANAGE,
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_MANAGE,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
    Permission.DOCUMENT_DELETE,
    Permission.REPORT_GENERATE,
    Permission.ANALYTICS_VIEW,
  ],

  [UserRole.FACILITY_ADMIN]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_DELETE,
    Permission.PATIENT_SEARCH,
    Permission.PATIENT_EXPORT,
    Permission.MEDICAL_RECORD_READ,
    Permission.MEDICAL_RECORD_EXPORT,
    Permission.MEDICAL_RECORD_PRINT,
    Permission.BIOMETRIC_ENROLL,
    Permission.BIOMETRIC_IDENTIFY,
    Permission.BIOMETRIC_VERIFY,
    Permission.BIOMETRIC_DELETE,
    Permission.BIOMETRIC_VIEW_STATUS,
    Permission.BIOMETRIC_DEVICE_MANAGE,
    Permission.AUDIT_LOG_READ,
    Permission.SECURITY_EVENT_READ,
    Permission.USER_MANAGE,
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.ROLE_READ,
    Permission.FACILITY_READ,
    Permission.FACILITY_MANAGE,
    Permission.ORGANIZATION_READ,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
    Permission.DOCUMENT_DELETE,
    Permission.REPORT_GENERATE,
    Permission.ANALYTICS_VIEW,
  ],

  [UserRole.DOCTOR]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_SEARCH,
    Permission.MEDICAL_RECORD_CREATE,
    Permission.MEDICAL_RECORD_READ,
    Permission.MEDICAL_RECORD_UPDATE,
    Permission.MEDICAL_RECORD_SIGN,
    Permission.MEDICAL_RECORD_PRINT,
    Permission.DIAGNOSIS_CREATE,
    Permission.DIAGNOSIS_READ,
    Permission.DIAGNOSIS_UPDATE,
    Permission.PRESCRIPTION_CREATE,
    Permission.PRESCRIPTION_READ,
    Permission.PRESCRIPTION_UPDATE,
    Permission.LAB_REPORT_CREATE,
    Permission.LAB_REPORT_READ,
    Permission.LAB_REPORT_VERIFY,
    Permission.VITAL_CREATE,
    Permission.VITAL_READ,
    Permission.VITAL_UPDATE,
    Permission.BIOMETRIC_VERIFY,
    Permission.BIOMETRIC_VIEW_STATUS,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
    Permission.REPORT_GENERATE,
  ],

  [UserRole.NURSE]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_SEARCH,
    Permission.PATIENT_UPDATE,
    Permission.MEDICAL_RECORD_READ,
    Permission.MEDICAL_RECORD_UPDATE,
    Permission.DIAGNOSIS_READ,
    Permission.PRESCRIPTION_READ,
    Permission.LAB_REPORT_READ,
    Permission.VITAL_CREATE,
    Permission.VITAL_READ,
    Permission.VITAL_UPDATE,
    Permission.BIOMETRIC_ENROLL,
    Permission.BIOMETRIC_VERIFY,
    Permission.BIOMETRIC_VIEW_STATUS,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.PHARMACIST]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_SEARCH,
    Permission.PRESCRIPTION_READ,
    Permission.PRESCRIPTION_DISPENSE,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.LAB_TECHNICIAN]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_SEARCH,
    Permission.LAB_REPORT_CREATE,
    Permission.LAB_REPORT_READ,
    Permission.LAB_REPORT_UPDATE,
    Permission.LAB_REPORT_VERIFY,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.RADIOLOGIST]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_SEARCH,
    Permission.MEDICAL_RECORD_READ,
    Permission.LAB_REPORT_CREATE,
    Permission.LAB_REPORT_READ,
    Permission.LAB_REPORT_UPDATE,
    Permission.LAB_REPORT_VERIFY,
    Permission.DOCUMENT_UPLOAD,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.RECEPTIONIST]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_SEARCH,
    Permission.BIOMETRIC_ENROLL,
    Permission.BIOMETRIC_IDENTIFY,
    Permission.BIOMETRIC_VERIFY,
    Permission.BIOMETRIC_VIEW_STATUS,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.BILLING_STAFF]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_SEARCH,
    Permission.MEDICAL_RECORD_READ,
    Permission.PRESCRIPTION_READ,
    Permission.LAB_REPORT_READ,
    Permission.DOCUMENT_READ,
    Permission.REPORT_GENERATE,
    Permission.ANALYTICS_VIEW,
  ],

  [UserRole.USER]: [
    Permission.MEDICAL_RECORD_READ,      // Own records only (enforced in service layer)
    Permission.PRESCRIPTION_READ,
    Permission.LAB_REPORT_READ,
    Permission.VITAL_READ,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.PATIENT]: [
    Permission.MEDICAL_RECORD_READ,      // Own records only (enforced in service layer)
    Permission.PRESCRIPTION_READ,
    Permission.LAB_REPORT_READ,
    Permission.VITAL_READ,
    Permission.DOCUMENT_READ,
  ],

  [UserRole.AUDITOR]: [
    Permission.AUDIT_LOG_READ,
    Permission.AUDIT_LOG_EXPORT,
    Permission.SECURITY_EVENT_READ,
    Permission.SECURITY_EVENT_ACKNOWLEDGE,
    Permission.USER_READ,
    Permission.ROLE_READ,
    Permission.ORGANIZATION_READ,
    Permission.FACILITY_READ,
    Permission.REPORT_GENERATE,
    Permission.ANALYTICS_VIEW,
  ],
};
