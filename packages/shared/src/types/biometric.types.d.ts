/**
 * SECURITY NOTICE:
 * These types are shared between frontend and backend.
 * Raw biometric templates, fingerprint images, and minutiae data
 * are NEVER included here. Only metadata is exposed to clients.
 * Raw template processing occurs server-side only.
 */
/**
 * Supported biometric modalities
 */
export type BiometricModality = 'FINGERPRINT' | 'IRIS' | 'FACE' | 'PALM_VEIN';
/**
 * Quality level of a captured sample
 */
export type BiometricQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'REJECTED';
/**
 * Status of a biometric enrollment
 */
export type EnrollmentStatus = 'NOT_ENROLLED' | 'ENROLLMENT_PENDING' | 'ENROLLED' | 'ENROLLMENT_FAILED' | 'SUSPENDED';
/**
 * Result of a biometric operation
 */
export type BiometricOperationResult = 'SUCCESS' | 'FAILURE' | 'NO_MATCH' | 'MULTIPLE_MATCHES' | 'LOW_QUALITY' | 'TIMEOUT' | 'CANCELLED';
/**
 * Biometric enrollment request — sent from client to initiate enrollment.
 * Does NOT carry raw image data; the device captures directly to the server.
 */
export interface BiometricEnrollmentRequest {
    patientId: string;
    modality: BiometricModality;
    deviceId: string;
    deviceType: string;
    captureSessionToken: string;
    numberOfSamples?: number;
    enrolledBy: string;
    consentObtained: boolean;
    consentTimestamp: Date;
    notes?: string;
}
/**
 * Biometric identification request — identify patient from biometric only.
 * No patient ID is known in advance (1:N search).
 */
export interface BiometricIdentifyRequest {
    modality: BiometricModality;
    deviceId: string;
    deviceType: string;
    captureSessionToken: string;
    organizationId: string;
    facilityId?: string;
    requestedBy: string;
    purpose: 'PATIENT_LOOKUP' | 'ACCESS_CONTROL' | 'MEDICATION_VERIFICATION';
    requestId: string;
}
/**
 * Biometric verification request — verify a known patient (1:1 match).
 */
export interface BiometricVerifyRequest {
    patientId: string;
    modality: BiometricModality;
    deviceId: string;
    deviceType: string;
    captureSessionToken: string;
    requestedBy: string;
    purpose: 'PATIENT_VERIFICATION' | 'CONSENT_VERIFICATION' | 'HIGH_RISK_ACTION';
    requestId: string;
}
/**
 * Result returned after any biometric operation.
 * Never includes raw templates or image data.
 */
export interface BiometricResult {
    requestId: string;
    operation: 'ENROLL' | 'IDENTIFY' | 'VERIFY';
    result: BiometricOperationResult;
    confidence?: number;
    patientId?: string;
    patientMrn?: string;
    enrollmentId?: string;
    modality: BiometricModality;
    quality?: BiometricQuality;
    processingTimeMs: number;
    timestamp: Date;
    errorCode?: string;
    errorMessage?: string;
    requiresManualVerification?: boolean;
    auditLogId: string;
}
/**
 * Biometric template metadata — describes an enrolled template.
 * Never exposes the actual binary template or image.
 */
export interface BiometricTemplate {
    id: string;
    patientId: string;
    modality: BiometricModality;
    enrolledAt: Date;
    enrolledBy: string;
    deviceId: string;
    deviceType: string;
    quality: BiometricQuality;
    isActive: boolean;
    lastUsedAt?: Date;
    usageCount: number;
    expiresAt?: Date;
    organizationId: string;
    facilityId: string;
    version: number;
}
/**
 * Enrollment status for a patient (summary for UI)
 */
export interface PatientBiometricStatus {
    patientId: string;
    enrollmentStatus: EnrollmentStatus;
    enrolledModalities: BiometricModality[];
    templateCount: number;
    lastEnrolledAt?: Date;
    lastVerifiedAt?: Date;
    activeTemplates: Pick<BiometricTemplate, 'id' | 'modality' | 'enrolledAt' | 'quality' | 'isActive'>[];
}
/**
 * Device registration info (for approved capture devices)
 */
export interface BiometricDevice {
    id: string;
    name: string;
    type: string;
    modality: BiometricModality;
    serialNumber: string;
    firmwareVersion: string;
    facilityId: string;
    organizationId: string;
    isActive: boolean;
    lastSeenAt?: Date;
    registeredAt: Date;
}
//# sourceMappingURL=biometric.types.d.ts.map