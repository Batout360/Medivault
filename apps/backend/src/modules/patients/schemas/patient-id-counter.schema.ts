import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatientIdCounterDocument = HydratedDocument<PatientIdCounter>;

/**
 * Atomic counter backing the immutable MediVault patient ID (MV-YYYY-NNNNNN).
 *
 * One document per year — `_id` is the year (e.g. "2026"). The sequence is
 * incremented with a single atomic `$inc` so concurrent registrations can never
 * produce the same ID (race-safe without a distributed lock).
 */
@Schema({ collection: 'patient_id_counters', timestamps: false })
export class PatientIdCounter {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}

export const PatientIdCounterSchema = SchemaFactory.createForClass(PatientIdCounter);
