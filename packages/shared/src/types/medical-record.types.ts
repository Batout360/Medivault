/**
 * Overall status of a medical record
 */
export type RecordStatus = 'DRAFT' | 'ACTIVE' | 'AMENDED' | 'ARCHIVED' | 'DELETED';

/**
 * Record type discriminator
 */
export type RecordType =
  | 'CONSULTATION'
  | 'DIAGNOSIS'
  | 'PRESCRIPTION'
  | 'LAB_REPORT'
  | 'VITAL_SIGNS'
  | 'CLINICAL_NOTE'
  | 'VACCINATION'
  | 'PROCEDURE'
  | 'DISCHARGE_SUMMARY'
  | 'REFERRAL';

/**
 * Root Medical Record — the encounter/visit container
 */
export interface MedicalRecord {
  id: string;
  patientId: string;
  encounterId: string;           // Unique per visit/encounter
  encounterDate: string;         // ISO date string
  encounterType: 'OUTPATIENT' | 'INPATIENT' | 'EMERGENCY' | 'TELEMEDICINE' | 'FOLLOW_UP';
  facilityId: string;
  organizationId: string;
  attendingPhysicianId: string;
  consultingPhysicianIds: string[];
  chiefComplaint: string;
  historyOfPresentIllness?: string;
  reviewOfSystems?: string;
  physicalExamination?: string;
  assessmentAndPlan?: string;
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  vitals: Vital[];
  labReports: LabReport[];
  clinicalNotes: ClinicalNote[];
  procedures: Procedure[];
  vaccinations: Vaccination[];
  status: RecordStatus;
  isConfidential: boolean;       // Extra access restriction
  admissionDate?: string;        // For inpatient
  dischargeDate?: string;
  dischargeNotes?: string;
  followUpDate?: string;
  followUpInstructions?: string;
  attachmentIds: string[];       // Document IDs
  createdBy: string;
  lastModifiedBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;               // Optimistic locking / audit trail
}

/**
 * Diagnosis entry within a medical record
 */
export interface Diagnosis {
  id: string;
  recordId: string;
  icdCode: string;               // ICD-10 code
  icdVersion: 'ICD-10' | 'ICD-11';
  description: string;
  type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  status: 'CONFIRMED' | 'SUSPECTED' | 'RULED_OUT' | 'RESOLVED';
  onsetDate?: string;
  resolvedDate?: string;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  clinicalFindings?: string;
  notes?: string;
  diagnosedBy: string;           // User ID
  diagnosedAt: Date;
}

/**
 * Medication unit of measure
 */
export type DosageUnit = 'mg' | 'mcg' | 'g' | 'ml' | 'units' | 'IU' | 'mEq' | 'mmol';

/**
 * Prescription / medication order
 */
export interface Prescription {
  id: string;
  recordId: string;
  medicationName: string;
  genericName?: string;
  brandName?: string;
  dosage: string;                // e.g. "500mg"
  dosageUnit: DosageUnit;
  frequency: string;             // e.g. "twice daily"
  route: 'ORAL' | 'IV' | 'IM' | 'SC' | 'TOPICAL' | 'INHALATION' | 'SUBLINGUAL' | 'RECTAL' | 'OTHER';
  duration: string;              // e.g. "7 days"
  startDate: string;
  endDate?: string;
  refillsAllowed: number;
  refillsUsed: number;
  instructions?: string;
  warnings?: string;
  prescribedBy: string;          // User ID
  prescribedAt: Date;
  dispensedAt?: Date;
  status: 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED' | 'ON_HOLD';
  discontinuedReason?: string;
  interactionAlerts?: string[];
}

/**
 * Individual medication in a patient's medication list
 */
export interface Medication {
  id: string;
  patientId: string;
  medicationName: string;
  genericName?: string;
  dosage: string;
  dosageUnit: DosageUnit;
  frequency: string;
  route: string;
  startDate: string;
  endDate?: string;
  prescribedBy?: string;
  prescriptionId?: string;
  isCurrentlyTaking: boolean;
  indication?: string;           // Reason for taking
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lab report result
 */
export interface LabReport {
  id: string;
  recordId: string;
  patientId: string;
  testName: string;
  testCode?: string;             // LOINC or internal code
  loincCode?: string;
  category: 'HEMATOLOGY' | 'BIOCHEMISTRY' | 'MICROBIOLOGY' | 'RADIOLOGY' | 'PATHOLOGY' | 'IMMUNOLOGY' | 'OTHER';
  orderedBy: string;             // User ID
  orderedAt: Date;
  collectedAt?: Date;
  reportedAt?: Date;
  laboratoryName?: string;
  laboratoryId?: string;
  results: LabTestResult[];
  interpretation?: string;
  criticalValues?: string[];
  status: 'ORDERED' | 'COLLECTED' | 'PROCESSING' | 'REPORTED' | 'VERIFIED' | 'CANCELLED';
  attachmentId?: string;         // PDF/image of the report
  notes?: string;
}

/**
 * Individual test result within a lab report
 */
export interface LabTestResult {
  parameter: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH';
  notes?: string;
}

/**
 * Vital signs measurement
 */
export interface Vital {
  id: string;
  recordId: string;
  patientId: string;
  measuredAt: Date;
  measuredBy: string;            // User ID
  temperature?: number;          // Celsius
  temperatureUnit?: 'C' | 'F';
  bloodPressureSystolic?: number;   // mmHg
  bloodPressureDiastolic?: number;  // mmHg
  heartRate?: number;            // bpm
  respiratoryRate?: number;      // breaths/min
  oxygenSaturation?: number;     // SpO2 %
  weight?: number;               // kg
  height?: number;               // cm
  bmi?: number;                  // Calculated
  painScore?: number;            // 0-10
  bloodGlucose?: number;         // mg/dL
  notes?: string;
  positionForBP?: 'SITTING' | 'STANDING' | 'LYING';
}

/**
 * Clinical note (progress note, nursing note, etc.)
 */
export interface ClinicalNote {
  id: string;
  recordId: string;
  patientId: string;
  noteType: 'PROGRESS_NOTE' | 'NURSING_NOTE' | 'CONSULTATION_NOTE' | 'DISCHARGE_NOTE' | 'REFERRAL_NOTE' | 'OPERATIVE_NOTE';
  title?: string;
  content: string;               // Rich text / SOAP format
  soapSubjective?: string;
  soapObjective?: string;
  soapAssessment?: string;
  soapPlan?: string;
  isAddendum: boolean;
  addendsNoteId?: string;        // If this is an addendum to another note
  authorId: string;
  coSignedBy?: string;
  coSignedAt?: Date;
  status: 'DRAFT' | 'FINAL' | 'AMENDED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vaccination record
 */
export interface Vaccination {
  id: string;
  patientId: string;
  recordId?: string;
  vaccineName: string;
  vaccineCode?: string;          // CVX code
  manufacturer?: string;
  lotNumber?: string;
  expiryDate?: string;
  dose: string;                  // e.g. "1st dose", "booster"
  doseNumber?: number;
  series?: string;
  administeredDate: string;
  administeredBy: string;        // User ID
  administrationSite?: string;   // e.g. "left deltoid"
  route?: string;
  nextDoseDate?: string;
  adverseReactions?: string;
  notes?: string;
  createdAt: Date;
}

/**
 * Surgical or clinical procedure
 */
export interface Procedure {
  id: string;
  patientId: string;
  recordId?: string;
  procedureName: string;
  cptCode?: string;              // CPT code
  icdProcedureCode?: string;
  category: 'SURGICAL' | 'DIAGNOSTIC' | 'THERAPEUTIC' | 'PREVENTIVE';
  scheduledDate?: string;
  performedDate?: string;
  duration?: number;             // Minutes
  performedBy: string;           // Primary surgeon/physician ID
  assistants?: string[];
  anaesthesiaType?: 'GENERAL' | 'LOCAL' | 'REGIONAL' | 'SEDATION' | 'NONE';
  anaesthesiologist?: string;
  facilityId: string;
  operatingRoom?: string;
  indication: string;
  findings?: string;
  complications?: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  preOpNotes?: string;
  postOpNotes?: string;
  attachmentIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}
