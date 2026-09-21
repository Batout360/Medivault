/**
 * Supported gender values
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

/**
 * Blood group values
 */
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN';

/**
 * Marital status values
 */
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'OTHER';

/**
 * Address structure
 */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Emergency contact details
 */
export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
  alternatePhone?: string;
  email?: string;
  address?: Partial<Address>;
}

/**
 * Known allergy record
 */
export interface Allergy {
  id: string;
  substance: string;           // Drug, food, or environmental
  type: 'DRUG' | 'FOOD' | 'ENVIRONMENTAL' | 'OTHER';
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
  reaction: string;
  onsetDate?: string;          // ISO date string
  notes?: string;
  recordedBy: string;          // User ID
  recordedAt: Date;
}

/**
 * Chronic or ongoing medical condition
 */
export interface MedicalCondition {
  id: string;
  icdCode: string;             // ICD-10 code
  name: string;
  description?: string;
  diagnosedDate?: string;      // ISO date string
  status: 'ACTIVE' | 'RESOLVED' | 'CHRONIC' | 'INACTIVE';
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  treatingPhysician?: string;
  notes?: string;
  recordedBy: string;
  recordedAt: Date;
  updatedAt: Date;
}

/**
 * Insurance information
 */
export interface InsuranceInfo {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  holderName: string;
  holderRelationship: string;
  effectiveDate: string;
  expiryDate?: string;
  copay?: number;
  coverageType: string;
}

/**
 * Core Patient entity
 */
export interface Patient {
  patientId: string;                    // Internal UUID
  mrn: string;                          // Medical Record Number (unique within org)
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;                  // ISO date string (YYYY-MM-DD)
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: Address;
  emergencyContact: EmergencyContact;
  allergies: Allergy[];
  conditions: MedicalCondition[];
  maritalStatus?: MaritalStatus;
  nationality?: string;
  occupation?: string;
  religion?: string;                    // Optional, for dietary/treatment preferences
  language?: string;                    // Preferred language
  insuranceInfo?: InsuranceInfo[];
  organizationId: string;
  facilityId: string;
  registeredBy: string;                 // User ID of the staff who registered
  primaryPhysicianId?: string;         // Assigned doctor
  isActive: boolean;
  isDeceased: boolean;
  deceasedDate?: string;
  biometricEnrolled: boolean;
  biometricEnrolledAt?: Date;
  notes?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for registering a new patient
 */
export interface CreatePatientDto {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup?: BloodGroup;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: Address;
  emergencyContact: EmergencyContact;
  allergies?: Omit<Allergy, 'id' | 'recordedBy' | 'recordedAt'>[];
  conditions?: Omit<MedicalCondition, 'id' | 'recordedBy' | 'recordedAt' | 'updatedAt'>[];
  maritalStatus?: MaritalStatus;
  nationality?: string;
  occupation?: string;
  language?: string;
  insuranceInfo?: Omit<InsuranceInfo, never>[];
  facilityId: string;
  primaryPhysicianId?: string;
  notes?: string;
  tags?: string[];
}

/**
 * DTO for updating patient information
 */
export interface UpdatePatientDto {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  phone?: string;
  alternatePhone?: string | null;
  email?: string | null;
  address?: Partial<Address>;
  emergencyContact?: Partial<EmergencyContact>;
  maritalStatus?: MaritalStatus | null;
  nationality?: string | null;
  occupation?: string | null;
  language?: string | null;
  primaryPhysicianId?: string | null;
  notes?: string | null;
  tags?: string[];
  isActive?: boolean;
}

/**
 * Query parameters for searching patients
 */
export interface PatientSearchParams {
  query?: string;             // Full-text search on name, mrn, email, phone
  mrn?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  facilityId?: string;
  organizationId?: string;
  primaryPhysicianId?: string;
  isActive?: boolean;
  biometricEnrolled?: boolean;
  hasCondition?: string;      // ICD-10 code
  hasAllergy?: string;
  ageMin?: number;
  ageMax?: number;
  registeredFrom?: string;    // ISO date
  registeredTo?: string;      // ISO date
  page?: number;
  limit?: number;
  sortBy?: 'firstName' | 'lastName' | 'mrn' | 'dateOfBirth' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Lightweight patient summary for lists and search results
 */
export interface PatientSummary {
  patientId: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  primaryPhysicianId?: string;
  isActive: boolean;
  biometricEnrolled: boolean;
}

/**
 * Paginated patient response
 */
export interface PaginatedPatients {
  data: PatientSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
