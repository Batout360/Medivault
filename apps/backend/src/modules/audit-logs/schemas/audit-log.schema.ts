import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  eventType!: string;

  @Prop({ type: String, default: null, index: true })
  userId!: string | null;

  @Prop({ type: String, default: null })
  userRole!: string | null;

  @Prop({ type: String, default: null, index: true })
  organizationId!: string | null;

  @Prop({ type: String, default: null })
  facilityId!: string | null;

  @Prop({ type: String, default: null, index: true })
  patientId!: string | null;

  @Prop({ type: String, default: null })
  resourceType!: string | null;

  @Prop({ type: String, default: null })
  resourceId!: string | null;

  @Prop({ type: String, default: null })
  action!: string | null;

  @Prop({ type: String, required: true })
  result!: string;

  @Prop({ type: String, default: null })
  ipAddress!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  @Prop({ type: String, default: null })
  sessionId!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  metadata!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  severity!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  details!: Record<string, unknown> | null;

  @Prop({ type: Date, required: true, index: true })
  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
