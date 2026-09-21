import { Address, Allergy, BloodGroup, EmergencyContact, Gender, InsuranceInfo, MaritalStatus, Patient, PatientSummary } from '../types/patient.types';
/**
 * DTO for registering a new patient
 */
export interface RegisterPatientDto {
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
    maritalStatus?: MaritalStatus;
    nationality?: string;
    occupation?: string;
    language?: string;
    insuranceInfo?: InsuranceInfo[];
    facilityId: string;
    primaryPhysicianId?: string;
    notes?: string;
    tags?: string[];
}
/**
 * DTO for updating patient demographics
 */
export interface UpdatePatientDemographicsDto {
    firstName?: string;
    lastName?: string;
    middleName?: string | null;
    dateOfBirth?: string;
    gender?: Gender;
    bloodGroup?: BloodGroup | null;
    phone?: string;
    alternatePhone?: string | null;
    email?: string | null;
    address?: Partial<Address>;
    emergencyContact?: Partial<EmergencyContact>;
    maritalStatus?: MaritalStatus | null;
    nationality?: string | null;
    occupation?: string | null;
    language?: string | null;
    notes?: string | null;
    tags?: string[];
}
/**
 * DTO for adding an allergy
 */
export interface AddAllergyDto {
    substance: string;
    type: 'DRUG' | 'FOOD' | 'ENVIRONMENTAL' | 'OTHER';
    severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
    reaction: string;
    onsetDate?: string;
    notes?: string;
}
/**
 * DTO for updating an existing allergy
 */
export interface UpdateAllergyDto {
    substance?: string;
    type?: 'DRUG' | 'FOOD' | 'ENVIRONMENTAL' | 'OTHER';
    severity?: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
    reaction?: string;
    onsetDate?: string | null;
    notes?: string | null;
}
/**
 * DTO for adding a medical condition
 */
export interface AddConditionDto {
    icdCode: string;
    name: string;
    description?: string;
    diagnosedDate?: string;
    status: 'ACTIVE' | 'RESOLVED' | 'CHRONIC' | 'INACTIVE';
    severity?: 'MILD' | 'MODERATE' | 'SEVERE';
    treatingPhysician?: string;
    notes?: string;
}
/**
 * DTO for updating a medical condition
 */
export interface UpdateConditionDto {
    icdCode?: string;
    name?: string;
    description?: string | null;
    diagnosedDate?: string | null;
    status?: 'ACTIVE' | 'RESOLVED' | 'CHRONIC' | 'INACTIVE';
    severity?: 'MILD' | 'MODERATE' | 'SEVERE' | null;
    treatingPhysician?: string | null;
    notes?: string | null;
}
/**
 * DTO for adding insurance info
 */
export interface AddInsuranceDto {
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
 * Full patient response (for detail view)
 */
export interface PatientDetailResponseDto {
    patient: Patient;
    age: number;
    ageString: string;
    activeAllergiesCount: number;
    activeConditionsCount: number;
    lastVisitDate: string | null;
    totalVisits: number;
    primaryPhysicianName?: string;
}
/**
 * Search results response
 */
export interface PatientSearchResponseDto {
    results: PatientSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    query: string;
    appliedFilters: Record<string, unknown>;
}
/**
 * Biometric identification result for a patient
 */
export interface PatientBiometricIdentifyResponseDto {
    identified: boolean;
    confidence?: number;
    patient?: PatientSummary;
    requiresManualVerification: boolean;
    auditLogId: string;
}
/**
 * Patient transfer DTO (move between facilities)
 */
export interface TransferPatientDto {
    targetFacilityId: string;
    targetOrganizationId?: string;
    transferReason: string;
    transferDate: string;
    transferringPhysicianId: string;
    receivingPhysicianId?: string;
    includeAllRecords: boolean;
    notes?: string;
}
/**
 * Merge patients DTO (de-duplicate)
 */
export interface MergePatientsDto {
    sourcePatientId: string;
    targetPatientId: string;
    reason: string;
    confirmationCode: string;
}
/**
 * Patient statistics summary (for dashboard)
 */
export interface PatientStatsDto {
    totalPatients: number;
    activePatients: number;
    newPatientsThisMonth: number;
    newPatientsLastMonth: number;
    biometricEnrolledCount: number;
    biometricEnrollmentRate: number;
    byGender: Record<Gender, number>;
    byBloodGroup: Record<BloodGroup, number>;
    byAgeGroup: {
        pediatric: number;
        adult: number;
        senior: number;
    };
}
/**
 * Allergy alert (returned when accessing high-risk patients)
 */
export interface AllergyAlertDto {
    patientId: string;
    patientName: string;
    criticalAllergies: Pick<Allergy, 'substance' | 'type' | 'severity' | 'reaction'>[];
    hasDrugAllergies: boolean;
    hasLifeThreateningAllergies: boolean;
}
//# sourceMappingURL=patient.dto.d.ts.map