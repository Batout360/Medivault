import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PatientIdCounter, PatientIdCounterDocument } from './schemas/patient-id-counter.schema';

/**
 * Generates the global, immutable MediVault patient ID (`MV-YYYY-NNNNNN`).
 *
 * Format: MV-<year>-<6-digit zero-padded sequence>, e.g. MV-2026-000184.
 *
 * The sequence is drawn from an atomic per-year counter document, so two
 * concurrent registrations can never receive the same ID. IDs are never
 * reused, never re-sequenced, and are not derived from the Mongo _id.
 */
@Injectable()
export class PatientIdService {
  private readonly logger = new Logger(PatientIdService.name);

  constructor(
    @InjectModel(PatientIdCounter.name)
    private readonly counterModel: Model<PatientIdCounterDocument>,
  ) {}

  /** Generates the next `MV-YYYY-NNNNNN` patient ID. */
  async next(): Promise<string> {
    const year = String(new Date().getFullYear());
    const seq = await this.increment(year);
    return PatientIdService.format(year, seq);
  }

  private async increment(year: string): Promise<number> {
    // Create the year document (seq: 0) if it does not exist yet.
    await this.counterModel.updateOne(
      { _id: year },
      { $setOnInsert: { seq: 0 } },
      { upsert: true },
    );

    // Atomically claim the next sequence number.
    const updated = await this.counterModel
      .findOneAndUpdate({ _id: year }, { $inc: { seq: 1 } }, { new: true })
      .lean()
      .exec();

    const seq = updated?.seq ?? 1;
    if (seq > 999_999) {
      this.logger.error(`Patient ID sequence exhausted for year ${year} (${seq}).`);
      throw new Error('Patient ID sequence exhausted for the current year.');
    }
    return seq;
  }

  /** Builds a canonical `MV-YYYY-NNNNNN` label, or null for invalid input. */
  static format(year: string, seq: number): string {
    return `MV-${year}-${String(seq).padStart(6, '0')}`;
  }

  /** Normalizes any user-typed patient ID to the canonical uppercase form. */
  static normalize(value: string): string | null {
    const match = /^\s*MV[- ]?([0-9]{4})[- ]?([0-9]{1,6})\s*$/i.exec(value);
    if (!match) return null;
    const [, year, seq] = match;
    return this.format(year!, Number.parseInt(seq!, 10));
  }
}
