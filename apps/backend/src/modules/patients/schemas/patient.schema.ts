import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Embedded sub-document schemas
// ---------------------------------------------------------------------------

@Schema({ _id: false })
export class EmergencyContact {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  relationship!: string;

  @Prop({ type: String, required: true })
  phone!: string;

  @Prop({ type: String, default: null })
  email!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export const EmergencyContactSchema = SchemaFactory.createForClass(EmergencyContact);

@Schema({ _id: false })
export class PatientAllergy {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  allergen!: string;

  @Prop({ type: String, default: null })
  allergyType!: string | null;

  @Prop({ type: String, default: null })
  severity!: string | null;

  @Prop({ type: String, default: null })
  reaction!: string | null;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export const PatientAllergySchema = SchemaFactory.createForClass(PatientAllergy);

@Schema({ _id: false })
export class PatientCondition {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  conditionName!: string;

  @Prop({ type: String, default: null })
  conditionCode!: string | null;

  @Prop({ type: String, default: 'ACTIVE' })
  status!: string;

  @Prop({ type: Date, default: null })
  diagnosedAt!: Date | null;

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export const PatientConditionSchema = SchemaFactory.createForClass(PatientCondition);

// ---------------------------------------------------------------------------
// Root Patient document
// ---------------------------------------------------------------------------

export type PatientDocument = HydratedDocument<Patient>;

@Schema({ collection: 'patients', timestamps: false })
export class Patient {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, unique: true })
  mrn!: string;

  /** 8-character public profile code (unique within the organization) used by
   *  doctors/admins to look up a patient profile without exposing the internal UUID. */
  @Prop({ type: String, default: null, index: true })
  profileId!: string | null;

  /** Canonical MediVault patient ID in the form MV-YYYY-NNNNNN (e.g. MV-2026-000184).
   *  Generated server-side from an atomic counter, immutable, and never reused.
   *  Sparse/indexed so legacy records without one coexist. */
  @Prop({ type: String, default: null })
  patientId!: string | null;

  @Prop({ type: String, required: true })
  firstName!: string;

  @Prop({ type: String, required: true })
  lastName!: string;

  /** Optional middle name — not in the slim schema but kept for DTO compatibility */
  @Prop({ type: String, default: null })
  middleName!: string | null;

  @Prop({ type: Date, required: true })
  dateOfBirth!: Date;

  @Prop({ type: String, required: true })
  gender!: string;

  @Prop({ type: String, default: null })
  bloodGroup!: string | null;

  @Prop({ type: String, default: null })
  phoneNumber!: string | null;

  @Prop({ type: String, default: null })
  email!: string | null;

  /** Stored as a JSON-serialised object (matches legacy SQL behaviour) */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  address!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  city!: string | null;

  @Prop({ type: String, default: null })
  state!: string | null;

  @Prop({ type: String, default: null })
  pincode!: string | null;

  @Prop({ type: String, default: null, index: true })
  organizationId!: string | null;

  @Prop({ type: String, default: null, index: true })
  facilityId!: string | null;

  /** Linked user account id (same person). Kept in sync with the registration backend. */
  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ type: String, required: true })
  registeredById!: string;

  @Prop({ type: Date, required: true })
  registeredAt!: Date;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  biometricEnrolled!: boolean;

  // Embedded arrays (replaces separate SQL tables)
  @Prop({ type: [EmergencyContactSchema], default: [] })
  emergencyContacts!: EmergencyContact[];

  @Prop({ type: [PatientAllergySchema], default: [] })
  allergies!: PatientAllergy[];

  @Prop({ type: [PatientConditionSchema], default: [] })
  conditions!: PatientCondition[];

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

// ── Indexes ────────────────────────────────────────────────────────────────
// Compound index for all tenant-scoped list/search queries (the most common pattern)
PatientSchema.index({ organizationId: 1, deletedAt: 1, registeredAt: -1 });
// Compound index for facility-scoped queries
PatientSchema.index({ organizationId: 1, facilityId: 1, deletedAt: 1 });
// Search by name within org
PatientSchema.index({ organizationId: 1, lastName: 1, firstName: 1, deletedAt: 1 });
// Search by phone / email
PatientSchema.index({ organizationId: 1, phoneNumber: 1, deletedAt: 1 });
PatientSchema.index({ organizationId: 1, email: 1, deletedAt: 1 });
// Look up a patient from a user account link
PatientSchema.index({ organizationId: 1, userId: 1, deletedAt: 1 });
// MRN is already unique but add org scoping for the uniqueness-check query
PatientSchema.index({ organizationId: 1, mrn: 1 }, { unique: true, sparse: false });
// Profile code is unique within the organization (sparse so legacy docs without one coexist)
PatientSchema.index({ organizationId: 1, profileId: 1 }, { unique: true, sparse: true });
// MediVault patient ID is globally unique, immutable, and never reused
PatientSchema.index({ patientId: 1 }, { unique: true, sparse: true });
