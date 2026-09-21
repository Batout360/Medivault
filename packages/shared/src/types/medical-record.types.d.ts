/**
 * Overall status of a medical record
 */
export type RecordStatus = 'DRAFT' | 'ACTIVE' | 'AMENDED' | 'ARCHIVED' | 'DELETED';
/**
 * Record type discriminator
 */
export type RecordType = 'CONSULTATION' | 'DIAGNOSIS' | 'PRESCRIPTION' | 'LAB_REPORT' | 'VITAL_SIGNS' | 'CLINICAL_NOTE' | 'VACCINATION' | 'PROCEDURE' | 'DISCHARGE_SUMMARY' | 'REFERRAL';
/**
 * Root Medical Record — the encounter/visit container
 */
export interface MedicalRecord {
    id: string;
    patientId: string;
    encounterId: string;
    encounterDate: string;
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
    isConfidential: boolean;
    admissionDate?: string;
    dischargeDate?: string;
    dischargeNotes?: string;
    followUpDate?: string;
    followUpInstructions?: string;
    attachmentIds: string[];
    createdBy: string;
    lastModifiedBy: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}
/**
 * Diagnosis entry within a medical record
 */
export interface Diagnosis {
    id: string;
    recordId: string;
    icdCode: string;
    icdVersion: 'ICD-10' | 'ICD-11';
    description: string;
    type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
    status: 'CONFIRMED' | 'SUSPECTED' | 'RULED_OUT' | 'RESOLVED';
    onsetDate?: string;
    resolvedDate?: string;
    severity?: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
    clinicalFindings?: string;
    notes?: string;
    diagnosedBy: string;
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
    dosage: string;
    dosageUnit: DosageUnit;
    frequency: string;
    route: 'ORAL' | 'IV' | 'IM' | 'SC' | 'TOPICAL' | 'INHALATION' | 'SUBLINGUAL' | 'RECTAL' | 'OTHER';
    duration: string;
    startDate: string;
    endDate?: string;
    refillsAllowed: number;
    refillsUsed: number;
    instructions?: string;
    warnings?: string;
    prescribedBy: string;
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
    indication?: string;
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
    testCode?: string;
    loincCode?: string;
    category: 'HEMATOLOGY' | 'BIOCHEMISTRY' | 'MICROBIOLOGY' | 'RADIOLOGY' | 'PATHOLOGY' | 'IMMUNOLOGY' | 'OTHER';
    orderedBy: string;
    orderedAt: Date;
    collectedAt?: Date;
    reportedAt?: Date;
    laboratoryName?: string;
    laboratoryId?: string;
    results: LabTestResult[];
    interpretation?: string;
    criticalValues?: string[];
    status: 'ORDERED' | 'COLLECTED' | 'PROCESSING' | 'REPORTED' | 'VERIFIED' | 'CANCELLED';
    attachmentId?: string;
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
    measuredBy: string;
    temperature?: number;
    temperatureUnit?: 'C' | 'F';
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRate?: number;
    respiratoryRate?: number;
    oxygenSaturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    painScore?: number;
    bloodGlucose?: number;
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
    content: string;
    soapSubjective?: string;
    soapObjective?: string;
    soapAssessment?: string;
    soapPlan?: string;
    isAddendum: boolean;
    addendsNoteId?: string;
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
    vaccineCode?: string;
    manufacturer?: string;
    lotNumber?: string;
    expiryDate?: string;
    dose: string;
    doseNumber?: number;
    series?: string;
    administeredDate: string;
    administeredBy: string;
    administrationSite?: string;
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
    cptCode?: string;
    icdProcedureCode?: string;
    category: 'SURGICAL' | 'DIAGNOSTIC' | 'THERAPEUTIC' | 'PREVENTIVE';
    scheduledDate?: string;
    performedDate?: string;
    duration?: number;
    performedBy: string;
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
//# sourceMappingURL=medical-record.types.d.ts.map