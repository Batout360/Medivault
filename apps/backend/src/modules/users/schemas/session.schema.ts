import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ collection: 'sessions', timestamps: false })
export class Session {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true, select: false })
  refreshTokenHash!: string;

  @Prop({ type: Boolean, required: true, default: false })
  isRevoked!: boolean;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: String, default: null })
  ipAddress!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  @Prop({ type: String, default: null })
  deviceId!: string | null;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// ── Indexes ────────────────────────────────────────────────────────────────
// Active sessions lookup (used on every token refresh)
SessionSchema.index({ userId: 1, isRevoked: 1, expiresAt: 1 });
// TTL index — MongoDB auto-deletes expired sessions after 1 day grace period
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
