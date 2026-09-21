import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BiometricTemplateDocument = HydratedDocument<BiometricTemplate>;

@Schema({ collection: 'biometric_templates', timestamps: false })
export class BiometricTemplate {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  patientId!: string;

  @Prop({ type: String, required: true, select: false })
  templateData!: string;

  @Prop({ type: String, required: true })
  templateVersion!: string;

  @Prop({ type: String, required: true })
  enrolledById!: string;

  @Prop({ type: String, default: null })
  deviceId!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const BiometricTemplateSchema = SchemaFactory.createForClass(BiometricTemplate);
