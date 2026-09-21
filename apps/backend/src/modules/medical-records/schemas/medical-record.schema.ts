import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

/** Discriminator values for the type field */
export type MedicalRecordType =
  | 'encounter'
  | 'diagnosis'
  | 'vital'
  | 'note'
  | 'prescription'
  | 'lab_report'
  | 'imaging'
  | 'vaccination'
  | 'procedure';

export const MEDICAL_RECORD_TYPES: MedicalRecordType[] = [
  'encounter',
  'diagnosis',
  'vital',
  'note',
  'prescription',
  'lab_report',
  'imaging',
  'vaccination',
  'procedure',
];

@Schema({ collection: 'medical_records', timestamps: false })
export class MedicalRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, enum: MEDICAL_RECORD_TYPES, index: true })
  type!: MedicalRecordType;

  @Prop({ type: String, required: true, index: true })
  patientId!: string;

  @Prop({ type: String, default: null, index: true })
  encounterId!: string | null;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: String, required: true, index: true })
  organizationId!: string;

  @Prop({ type: String, default: null })
  facilityId!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data!: Record<string, unknown>;

  @Prop({ type: Date, required: true, index: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);

// ── Indexes ────────────────────────────────────────────────────────────────
// Primary query pattern: all records for a patient filtered by type
MedicalRecordSchema.index({ patientId: 1, type: 1, deletedAt: 1, createdAt: -1 });
// Encounter sub-record lookup (getEncounterById loads all sub-records by encounterId+type)
MedicalRecordSchema.index({ encounterId: 1, type: 1, deletedAt: 1 });
// Org-level queries (audit, admin views)
MedicalRecordSchema.index({ organizationId: 1, type: 1, deletedAt: 1, createdAt: -1 });
