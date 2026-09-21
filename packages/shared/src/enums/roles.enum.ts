export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  FACILITY_ADMIN = 'FACILITY_ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  PHARMACIST = 'PHARMACIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
  RADIOLOGIST = 'RADIOLOGIST',
  RECEPTIONIST = 'RECEPTIONIST',
  BILLING_STAFF = 'BILLING_STAFF',
  USER = 'USER',
  PATIENT = 'PATIENT',
  AUDITOR = 'AUDITOR',
}

export const UserRoleLabels: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Administrator',
  [UserRole.ORG_ADMIN]: 'Organization Admin',
  [UserRole.FACILITY_ADMIN]: 'Facility Admin',
  [UserRole.DOCTOR]: 'Doctor',
  [UserRole.NURSE]: 'Nurse',
  [UserRole.PHARMACIST]: 'Pharmacist',
  [UserRole.LAB_TECHNICIAN]: 'Lab Technician',
  [UserRole.RADIOLOGIST]: 'Radiologist',
  [UserRole.RECEPTIONIST]: 'Receptionist',
  [UserRole.BILLING_STAFF]: 'Billing Staff',
  [UserRole.USER]: 'User',
  [UserRole.PATIENT]: 'Patient',
  [UserRole.AUDITOR]: 'Auditor',
};

/** True for roles that behave as patient-facing accounts. */
export const PATIENT_ROLES: readonly UserRole[] = [UserRole.USER, UserRole.PATIENT];
