import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '@medivault/shared';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: false })
export class User {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  username!: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, required: true })
  firstName!: string;

  @Prop({ type: String, required: true })
  lastName!: string;

  @Prop({ type: String, default: null })
  phone!: string | null;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(UserRole),
    default: UserRole.USER,
  })
  role!: UserRole;

  @Prop({ type: String, default: null })
  organizationId!: string | null;

  @Prop({ type: String, default: null })
  facilityId!: string | null;

  /** Hospital / clinic the user works at (primarily for clinical staff). */
  @Prop({ type: String, default: null })
  hospital!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  isActive!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  isEmailVerified!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  mfaEnabled!: boolean;

  @Prop({ type: String, default: null, select: false })
  mfaSecret!: string | null;

  @Prop({ type: String, required: true, default: '[]' })
  mfaBackupCodes!: string;

  @Prop({ type: Number, required: true, default: 0 })
  failedLoginAttempts!: number;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  @Prop({ type: Date, default: null })
  lastLoginAt!: Date | null;

  @Prop({ type: Date, default: null })
  passwordChangedAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  emailVerificationTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationTokenExpiresAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  resetTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  resetTokenExpiresAt!: Date | null;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
