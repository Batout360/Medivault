/**
 * BiometricProvider — adapter interface for fingerprint scanner SDKs.
 *
 * Production deployment MUST substitute a certified vendor SDK implementation
 * (e.g. Futronic, SecuGen, Suprema, ZKTeco) via the adapter pattern below.
 */
export interface BiometricMatchResult {
  matched: boolean;
  /** Similarity score 0–100. Only meaningful when matched=true */
  score?: number;
  /** Internal template identifier (never the raw template) */
  templateId?: string;
  /** Patient ID linked to the matched template */
  patientId?: string;
}

export interface BiometricEnrollResult {
  success: boolean;
  templateId: string;
  quality: number; // 0–100
  message?: string;
}

export interface BiometricCaptureData {
  /**
   * Opaque biometric payload produced by the vendor SDK on the workstation.
   * This is a base64-encoded representation of a vendor proprietary template,
   * NOT a raw fingerprint image.
   * Never constructed or interpreted in frontend JavaScript.
   */
  templatePayload: string;
  /** Format identifier so the backend knows which SDK produced this */
  format: string;
  /** ISO minutiae quality estimate 0–100 */
  quality: number;
  /** Device hardware ID for auditability */
  deviceId: string;
  /** Timestamp from the capture device (anti-replay) */
  capturedAt: string;
  /** HMAC signature from the biometric bridge (device authentication) */
  bridgeSignature?: string;
}

export interface BiometricProvider {
  /**
   * Enroll a new fingerprint template for a patient.
   * Returns only metadata — never returns the raw template.
   */
  enroll(patientId: string, captureData: BiometricCaptureData): Promise<BiometricEnrollResult>;

  /**
   * 1:N identification — search enrolled templates for a match.
   * The application passes the decrypted gallery (storage-located templates)
   * so SDK providers can perform real mathematical matching against them.
   * Returns at most one result (highest-scoring match above threshold).
   */
  identify(
    captureData: BiometricCaptureData,
    gallery?: BiometricTemplateGalleryItem[],
  ): Promise<BiometricMatchResult>;

  /**
   * 1:1 verification — confirm that captureData matches a specific patient.
   * `templates` are the patient's decrypted enrolled templates.
   */
  verify(
    patientId: string,
    captureData: BiometricCaptureData,
    templates?: BiometricTemplateGalleryItem[],
  ): Promise<BiometricMatchResult>;

  /**
   * Delete all templates for a patient (GDPR/privacy deletion).
   */
  deleteTemplates(patientId: string): Promise<void>;

  /**
   * Check that the provider/SDK is operational.
   */
  healthCheck(): Promise<boolean>;
}

/** Decrypted template as located from encrypted storage by the application. */
export interface BiometricTemplateGalleryItem {
  templateId: string;
  patientId: string;
  /** Base64 minutiae template (transient, in-memory only). */
  templatePayload: string;
  format: string;
  quality: number;
}

export const BIOMETRIC_PROVIDER = Symbol('BIOMETRIC_PROVIDER');
