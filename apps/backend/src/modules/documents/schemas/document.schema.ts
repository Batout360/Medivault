import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DocumentDoc = HydratedDocument<Document>;

@Schema({ collection: 'documents', timestamps: false })
export class Document {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  patientId!: string;

  @Prop({ type: String, required: true })
  uploadedById!: string;

  @Prop({ type: String, default: null, index: true })
  organizationId!: string | null;

  @Prop({ type: String, required: true })
  fileName!: string;

  @Prop({ type: String, required: true })
  originalName!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  @Prop({ type: String, required: true })
  storagePath!: string;

  @Prop({ type: String, default: null })
  category!: string | null;

  @Prop({ type: String, default: null })
  description!: string | null;

  /** Name of the external hospital/facility the record originated from. */
  @Prop({ type: String, default: null })
  sourceHospital!: string | null;

  /** Human-readable title of the record (e.g. "Chest X-Ray — June 2026"). */
  @Prop({ type: String, default: null })
  documentTitle!: string | null;

  /** Clinical date associated with the document (defaults to upload date). */
  @Prop({ type: Date, default: null })
  documentDate!: Date | null;

  /** Facility the record was produced in / belongs to (internal facility UUID). */
  @Prop({ type: String, default: null })
  facilityId!: string | null;

  /** Free-text clinical/clerical notes about the document. */
  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: Boolean, required: true, default: false })
  isDeleted!: boolean;

  /** When set, the document is archived (hidden from the active list but retained). */
  @Prop({ type: Date, default: null, index: true })
  archivedAt!: Date | null;

  /** User who archived (or last unarchived, when null) the document. */
  @Prop({ type: String, default: null })
  archivedById!: string | null;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(Document);

// All per-patient listing queries filter by patientId + isDeleted.
DocumentSchema.index({ patientId: 1, isDeleted: 1, createdAt: -1 });
DocumentSchema.index({ patientId: 1, isDeleted: 1, category: 1 });
DocumentSchema.index({ patientId: 1, isDeleted: 1, facilityId: 1 });
// Facility-wide (admin dashboard) queries: facility + archive status first.
DocumentSchema.index({
  organizationId: 1,
  facilityId: 1,
  isDeleted: 1,
  archivedAt: 1,
  createdAt: -1,
});
