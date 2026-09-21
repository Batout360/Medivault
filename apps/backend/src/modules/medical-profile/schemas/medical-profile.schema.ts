import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MedicalProfileDocument = HydratedDocument<MedicalProfile>;

/** Current lifecycle status of the patient's medical-profile QR code. */
export enum QrStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

/**
 * One document per patient, holding the cryptographic state of the medical
 * profile card's QR identifier.
 *
 * Security model:
 *  - Only a SHA-256 hash of the scan code is stored for verification. The raw
 *    code (which is printed on the physical card) is stored AES-256-GCM
 *    encrypted so it can be re-rendered into a PNG on demand without being
 *    persisted in plaintext.
 *  - The QR code carries no PHI — it only identifies the profile that must be
 *    opened through an authenticated, authorized viewer.
 */
@Schema({ collection: 'medical_profiles', timestamps: false })
export class MedicalProfile {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  patientId!: string;

  /** Null for self-service registrations; org-scoped once a facility adopts the patient. */
  @Prop({ type: String, default: null, index: true })
  organizationId!: string | null;

  @Prop({ type: String, required: true, enum: Object.values(QrStatus), default: QrStatus.ACTIVE })
  qrStatus!: QrStatus;

  /** SHA-256 hex digest of the active/inactive scan code — used for lookups. */
  @Prop({ type: String, default: null })
  qrCodeHash!: string | null;

  /** AES-256-GCM encrypted raw scan code — enables PNG re-rendering. */
  @Prop({ type: String, default: null })
  qrCodeEnc!: string | null;

  /** Origin used to build the payload URL (e.g. the frontend host). */
  @Prop({ type: String, default: null })
  qrBaseUrl!: string | null;

  /** Total number of times the QR verification endpoint has been hit. */
  @Prop({ type: Number, required: true, default: 0 })
  scanCount!: number;

  @Prop({ type: Date, default: null })
  lastScannedAt!: Date | null;

  @Prop({ type: Date, default: null })
  qrCreatedAt!: Date | null;

  @Prop({ type: Date, default: null })
  qrRevokedAt!: Date | null;

  @Prop({ type: String, default: null })
  qrRevokedById!: string | null;

  /** Human-readable MediVault ID derived from profileId, e.g. MV-8F29-4K72 */
  @Prop({ type: String, default: null, index: true })
  mvId!: string | null;

  /** Per-field visibility settings controlled by the patient */
  @Prop({ type: Object, default: () => ({}) })
  visibility!: {
    showName?: boolean;
    showPhoto?: boolean;
    showBloodType?: boolean;
    showAllergies?: boolean;
    showConditions?: boolean;
    showEmergencyContact?: boolean;
    showMedications?: boolean;
  };

  /** Timestamp of last public profile view */
  @Prop({ type: Date, default: null })
  lastPublicViewAt!: Date | null;

  /** Total public profile views (from QR scans) */
  @Prop({ type: Number, default: 0 })
  publicViewCount!: number;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const MedicalProfileSchema = SchemaFactory.createForClass(MedicalProfile);
