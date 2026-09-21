import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuditLogsService } from '../modules/audit-logs/audit-logs.service';
import { MedicalProfileService } from '../modules/medical-profile/medical-profile.service';
import { PatientIdService } from '../modules/patients/patient-id.service';
import { Patient, PatientDocument } from '../modules/patients/schemas/patient.schema';
import * as argon2 from 'argon2';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv } from 'crypto';
import { UserRole } from '@medivault/shared';

import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { Session, SessionDocument } from '../modules/users/schemas/session.schema';

import { LoginDto } from './dto/login.dto';
import { RegisterDto, SelfRegisterIdentityDto } from './dto/register.dto';
import { MfaSetupResponseDto, UserInfoDto } from './dto/auth-response.dto';

// ---------------------------------------------------------------------------
// Local user shape (kept for backward compat with tests).
// Maps to/from Mongoose UserDocument internally.
// ---------------------------------------------------------------------------
export interface UserRow {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  organizationId: string | null;
  facilityId: string | null;
  hospital: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaBackupCodes: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Shape of the JWT access token payload */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  organizationId: string | null;
  facilityId: string | null;
  hospital?: string | null;
  jti: string;
}

/** Shape of the JWT refresh token payload */
export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  jti: string;
}

/** Argon2id options — OWASP 2023 recommended minimum */
const ARGON2_OPTIONS: argon2.HashOptions = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

const TOKEN_BYTES = 32;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_CEILING_SECONDS = 30 * 60;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_TTL_SECONDS = 60 * 60;
const MAX_ACTIVE_SESSIONS = 5;

// ---------------------------------------------------------------------------
// Helper: map a Mongoose UserDocument to a UserRow
// ---------------------------------------------------------------------------
function docToUserRow(doc: UserDocument): UserRow {
  const plain = doc.toObject ? doc.toObject({ virtuals: false }) : (doc as any);
  return {
    id: plain._id as string,
    email: plain.email,
    username: plain.username,
    passwordHash: plain.passwordHash ?? '',
    firstName: plain.firstName,
    lastName: plain.lastName,
    phone: plain.phone ?? null,
    role: plain.role,
    organizationId: plain.organizationId ?? null,
    facilityId: plain.facilityId ?? null,
    hospital: plain.hospital ?? null,
    isActive: Boolean(plain.isActive),
    isEmailVerified: Boolean(plain.isEmailVerified),
    failedLoginAttempts: plain.failedLoginAttempts ?? 0,
    lockedUntil: plain.lockedUntil ?? null,
    lastLoginAt: plain.lastLoginAt ?? null,
    passwordChangedAt: plain.passwordChangedAt ?? null,
    mfaEnabled: Boolean(plain.mfaEnabled),
    mfaSecret: plain.mfaSecret ?? null,
    mfaBackupCodes: plain.mfaBackupCodes ?? '[]',
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    deletedAt: plain.deletedAt ?? null,
  };
}

/** True when the thrown error carries the given HTTP status code. */
function isHttpErrorCode(err: unknown, status: number): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status?: number }).status === status
  );
}

/** Safe human-readable message for any thrown value. */
function messageOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(Patient.name) private readonly patientModel: Model<PatientDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly medicalProfileService: MedicalProfileService,
    private readonly patientIdService: PatientIdService,
  ) {}

  // ── Utilities ─────────────────────────────────────────────────────────────

  private generateToken(bytes = TOKEN_BYTES): string {
    return randomBytes(bytes).toString('hex');
  }

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  private safeCompare(a: string, b: string): boolean {
    try {
      if (a.length !== b.length) return false;
      return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
  }

  private calcLockoutSeconds(failedAttempts: number): number {
    return Math.min(Math.pow(2, failedAttempts), LOCKOUT_CEILING_SECONDS);
  }

  // ── Password Hashing ──────────────────────────────────────────────────────

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  // ── Token Generation ──────────────────────────────────────────────────────

  private generateAccessToken(user: UserRow, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      organizationId: user.organizationId,
      facilityId: user.facilityId,
      hospital: user.hospital ?? null,
      jti: this.generateToken(16),
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        '15m',
      ) as JwtSignOptions['expiresIn'],
      issuer: 'medivault-api',
      audience: 'medivault-clients',
    });
  }

  /** Public helper used by the /auth/session endpoint to issue a fresh access token. */
  issueAccessToken(payload: AccessTokenPayload): { accessToken: string; expiresIn: number } {
    const expiresInStr = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const expiresIn = expiresInStr.endsWith('m')
      ? parseInt(expiresInStr) * 60
      : parseInt(expiresInStr);
    const accessToken = this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
        organizationId: payload.organizationId,
        facilityId: payload.facilityId,
        hospital: payload.hospital ?? null,
        jti: this.generateToken(16),
      },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: expiresInStr as JwtSignOptions['expiresIn'],
        issuer: 'medivault-api',
        audience: 'medivault-clients',
      },
    );
    return { accessToken, expiresIn };
  }

  private generateRefreshTokenJwt(userId: string, sessionId: string): string {
    const payload: RefreshTokenPayload = {
      sub: userId,
      sessionId,
      jti: this.generateToken(16),
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '7d',
      ) as JwtSignOptions['expiresIn'],
      issuer: 'medivault-api',
      audience: 'medivault-clients',
    });
  }

  // ── Lockout ───────────────────────────────────────────────────────────────

  private async checkLockout(user: UserRow): Promise<void> {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new HttpException(
        { message: `Account locked. Try again in ${retryAfter} seconds.`, retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await this.userModel.updateOne(
        { _id: user.id },
        { $set: { lockedUntil: null, failedLoginAttempts: 0, updatedAt: new Date() } },
      );
    }
  }

  private async recordFailedAttempt(user: UserRow, ip: string, userAgent: string): Promise<void> {
    const newCount = user.failedLoginAttempts + 1;

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      const lockSeconds = this.calcLockoutSeconds(newCount);
      const lockedUntil = new Date(Date.now() + lockSeconds * 1000);
      this.logger.warn(
        `Account ${user.email} locked for ${lockSeconds}s after ${newCount} failed attempts`,
      );

      await this.userModel.updateOne(
        { _id: user.id },
        { $set: { failedLoginAttempts: newCount, lockedUntil, updatedAt: new Date() } },
      );

      await this.auditLogs.log({
        eventType: 'AUTH_ACCOUNT_LOCKED',
        userId: user.id,
        ipAddress: ip,
        userAgent,
        result: 'failure',
        metadata: { reason: 'Too many failed login attempts' },
      });

      await this.auditLogs.createSecurityEvent({
        eventType: 'BRUTE_FORCE_ATTEMPT',
        severity: 'HIGH',
        userId: user.id,
        ipAddress: ip,
        userAgent,
        details: { failedAttempts: newCount },
      });
    } else {
      await this.userModel.updateOne(
        { _id: user.id },
        { $set: { failedLoginAttempts: newCount, updatedAt: new Date() } },
      );
    }
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    ip: string,
    userAgent: string,
  ): Promise<{ message: string; userId: string; identity?: unknown }> {
    const ALLOWED_ROLES: string[] = ['USER', 'PATIENT', 'DOCTOR', 'NURSE', 'RECEPTIONIST'];
    const role = dto.role ?? 'USER';
    if (!ALLOWED_ROLES.includes(role)) {
      throw new BadRequestException(
        `Role '${role}' cannot be self-registered. Contact an administrator.`,
      );
    }

    const wantsIdentity = dto.createPatientIdentity === true;
    if (wantsIdentity && !['USER', 'PATIENT'].includes(role)) {
      throw new BadRequestException(
        'Patient identity can only be created for a patient-facing (USER/PATIENT) account.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const normalizedUsername = dto.username.toLowerCase().trim();

    const existingEmail = await this.userModel
      .findOne({ email: normalizedEmail, deletedAt: null })
      .select('_id')
      .lean();
    if (existingEmail) {
      throw new ConflictException('An account with this email address already exists.');
    }

    const existingUsername = await this.userModel
      .findOne({ username: normalizedUsername, deletedAt: null })
      .select('_id')
      .lean();
    if (existingUsername) {
      throw new ConflictException('This username is already taken.');
    }

    const id = uuidv4();
    const passwordHash = await this.hashPassword(dto.password);
    const now = new Date();

    await this.userModel.create({
      _id: id,
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      role,
      organizationId: dto.organizationId ?? null,
      facilityId: null,
      isActive: true,
      isEmailVerified: false,
      mfaEnabled: false,
      mfaBackupCodes: '[]',
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditLogs.log({
      eventType: 'USER_CREATE',
      userId: id,
      ipAddress: ip,
      userAgent,
      result: 'success',
      metadata: { email: normalizedEmail, role },
    });

    // If the user requested a full patient identity, create the patient record,
    // the medical profile, and the QR card atomically. On any downstream failure
    // we compensate by removing everything created so far so a partial
    // registration can never be left behind.
    let identity: unknown;
    if (wantsIdentity) {
      try {
        identity = await this.createPatientIdentity(id, dto.identity, dto, ip, userAgent);
        const summary = identity as { patientId?: string; profileId?: string };
        await this.auditLogs.log({
          eventType: 'PATIENT_IDENTITY_CREATE',
          userId: id,
          userRole: role,
          ipAddress: ip,
          userAgent,
          result: 'success',
          metadata: {
            patientId: summary.patientId,
            profileId: summary.profileId,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Identity creation failed for registration ${id}; rolling back account.`,
          err instanceof Error ? err.stack : String(err),
        );
        // Compensation — reverse the creation order.
        await this.patientModel.deleteMany({ userId: id }).exec();
        await this.medicalProfileService.deleteForUserId(id).catch(() => undefined);
        await this.userModel.deleteOne({ _id: id }).exec();
        if (!isHttpErrorCode(err, 400)) {
          throw new BadRequestException(
            `Account could not be completed. Please try again. (${messageOf(err)})`,
          );
        }
        throw err;
      }
    }

    this.logger.log(`New registration: email=${normalizedEmail} role=${role} id=${id}`);
    return {
      message: wantsIdentity
        ? 'Account and medical identity created successfully. You can now log in.'
        : 'Account created successfully. You can now log in.',
      userId: id,
      ...(identity ? { identity } : {}),
    };
  }

  /**
   * Creates the linked patient record, medical profile and QR card for a
   * self-registered patient-facing account.
   */
  async createPatientIdentity(
    userId: string,
    identityInput: SelfRegisterIdentityDto | undefined,
    account: {
      firstName: string;
      lastName: string;
      phone?: string;
      email: string;
      organizationId?: string;
    },
    ip: string,
    userAgent: string,
  ) {
    const now = new Date();
    const patientId = await this.patientIdService.next();
    const profileId = await this.generateUniqueProfileId();

    const i = identityInput ?? {};
    const address = i.address ?? {};
    const emergencyContact = i.emergencyContact;
    const allergies = (i.allergies ?? []).map((a) => ({
      id: uuidv4(),
      allergen: a.allergen,
      allergyType: a.allergyType ?? null,
      severity: a.severity ?? null,
      reaction: a.reaction ?? null,
      notes: null,
      isActive: true,
      createdAt: now,
    }));
    const conditions = (i.conditions ?? []).map((c) => ({
      id: uuidv4(),
      conditionName: c.conditionName,
      conditionCode: null,
      status: 'ACTIVE',
      diagnosedAt: c.diagnosedAt ? new Date(c.diagnosedAt) : null,
      notes: c.notes ?? null,
      createdAt: now,
    }));

    const patientRecordId = uuidv4();
    await this.patientModel.create({
      _id: patientRecordId,
      mrn: `MRN-${now.getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`,
      profileId,
      patientId,
      firstName: account.firstName,
      lastName: account.lastName,
      middleName: null,
      dateOfBirth: i.dateOfBirth ? new Date(i.dateOfBirth) : now,
      gender: i.gender ?? 'PREFER_NOT_TO_SAY',
      bloodGroup: i.bloodGroup ?? null,
      phoneNumber: account.phone ?? null,
      email: account.email.toLowerCase().trim(),
      address:
        address.line1 || address.city || address.state || address.postalCode || address.country
          ? address
          : null,
      city: address.city ?? null,
      state: address.state ?? null,
      pincode: address.postalCode ?? null,
      organizationId: null,
      facilityId: null,
      userId,
      registeredById: userId,
      registeredAt: now,
      isActive: true,
      biometricEnrolled: false,
      emergencyContacts: emergencyContact
        ? [
            {
              id: uuidv4(),
              name: emergencyContact.name,
              relationship: emergencyContact.relationship,
              phone: emergencyContact.phone ?? '',
              email: null,
              isActive: true,
              createdAt: now,
            },
          ]
        : [],
      allergies,
      conditions,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Create the medical profile and QR card for this patient.
    const qr = await this.medicalProfileService.generateQr(
      patientRecordId,
      null,
      {
        sub: userId,
        email: account.email,
        role: 'USER',
        sessionId: '',
        organizationId: null,
        facilityId: null,
        jti: '',
      },
      undefined,
      { ip, userAgent, requestId: '' },
    );

    return {
      patientRecordId,
      patientId,
      profileId,
      mvId: this.formatMvId(profileId),
      qr: {
        status: qr.status,
        payloadUrl: qr.payloadUrl,
        qrDataUrl: qr.qrDataUrl,
      },
    };
  }

  private async generateUniqueProfileId(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code!: string;
    for (let attempts = 0; attempts < 10; attempts++) {
      let candidate = '';
      for (let i = 0; i < 8; i++) {
        candidate += alphabet[randomBytes(1)[0] % alphabet.length];
      }
      const existing = await this.patientModel
        .findOne({ profileId: candidate, deletedAt: null })
        .select('_id')
        .lean();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new BadRequestException('Unable to generate a unique profile code.');
    return code;
  }

  private formatMvId(profileId: string): string {
    const clean = profileId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean.length >= 8 ? `MV-${clean.slice(0, 4)}-${clean.slice(4, 8)}` : `MV-${clean}`;
  }

  // ── Validate User (LocalStrategy) ─────────────────────────────────────────

  async validateUser(email: string, password: string): Promise<UserRow | null> {
    const normalizedEmail = email.toLowerCase().trim();

    // select: false fields (passwordHash, mfaSecret) must be explicitly selected
    const doc = await this.userModel
      .findOne({ email: normalizedEmail, deletedAt: null })
      .select(
        '+passwordHash +mfaSecret +mfaBackupCodes +emailVerificationTokenHash +resetTokenHash',
      )
      .exec();

    if (!doc) {
      await argon2.hash('dummy-timing-prevention', ARGON2_OPTIONS);
      return null;
    }

    const user = docToUserRow(doc);

    await this.checkLockout(user);

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated. Contact your administrator.');
    }

    const isValid = await this.verifyPassword(user.passwordHash, password);
    if (!isValid) {
      await this.recordFailedAttempt(user, '', '');
      return null;
    }

    if (user.failedLoginAttempts > 0) {
      await this.userModel.updateOne(
        { _id: user.id },
        { $set: { failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() } },
      );
    }

    return user;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(
    validatedUser: UserRow,
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: UserInfoDto; expiresIn: number }> {
    if (validatedUser.mfaEnabled) {
      if (!dto.mfaCode) {
        throw new UnauthorizedException('MFA code is required for this account.');
      }
      await this.verifyTotpCode(validatedUser, dto.mfaCode);
    }

    // Enforce max concurrent sessions — count non-revoked, non-expired sessions
    const now = new Date();
    const activeCount = await this.sessionModel.countDocuments({
      userId: validatedUser.id,
      isRevoked: false,
      expiresAt: { $gt: now },
    });

    if (activeCount >= MAX_ACTIVE_SESSIONS) {
      // Revoke the oldest active session
      const oldest = await this.sessionModel
        .findOne({ userId: validatedUser.id, isRevoked: false })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (oldest) {
        await this.sessionModel.updateOne(
          { _id: oldest._id },
          { $set: { isRevoked: true, updatedAt: now } },
        );
      }
    }

    const sessionId = uuidv4();
    const sessionExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
    const rawRefreshToken = this.generateRefreshTokenJwt(validatedUser.id, sessionId);
    const tokenHash = this.hashToken(rawRefreshToken);

    await this.sessionModel.create({
      _id: sessionId,
      userId: validatedUser.id,
      refreshTokenHash: tokenHash,
      isRevoked: false,
      expiresAt: sessionExpiresAt,
      ipAddress: ip,
      userAgent,
      deviceId: dto.deviceId ?? null,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const accessToken = this.generateAccessToken(validatedUser, sessionId);

    await this.userModel.updateOne(
      { _id: validatedUser.id },
      { $set: { lastLoginAt: now, updatedAt: now } },
    );

    await this.auditLogs.log({
      eventType: 'AUTH_LOGIN_SUCCESS',
      userId: validatedUser.id,
      userRole: validatedUser.role,
      organizationId: validatedUser.organizationId ?? undefined,
      facilityId: validatedUser.facilityId ?? undefined,
      sessionId,
      ipAddress: ip,
      userAgent,
      result: 'success',
    });

    this.logger.log(`Login: user=${validatedUser.email} session=${sessionId}`);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      user: this.mapUserToInfoDto(validatedUser),
    };
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string, sessionId: string, ip: string, userAgent: string): Promise<void> {
    await this.sessionModel.updateOne(
      { _id: sessionId, userId },
      { $set: { isRevoked: true, updatedAt: new Date() } },
    );
    await this.auditLogs.log({
      eventType: 'AUTH_LOGOUT',
      userId,
      sessionId,
      ipAddress: ip,
      userAgent,
      result: 'success',
    });
  }

  async logoutAll(userId: string, ip: string, userAgent: string): Promise<void> {
    await this.sessionModel.updateMany(
      { userId, isRevoked: false },
      { $set: { isRevoked: true, updatedAt: new Date() } },
    );
    await this.auditLogs.log({
      eventType: 'AUTH_LOGOUT',
      userId,
      ipAddress: ip,
      userAgent,
      result: 'success',
      metadata: { scope: 'all_sessions' },
    });
  }

  // ── Refresh Tokens ────────────────────────────────────────────────────────

  async refreshTokens(
    rawRefreshToken: string,
    ip: string,
    userAgent: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        issuer: 'medivault-api',
        audience: 'medivault-clients',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const incomingHash = this.hashToken(rawRefreshToken);

    // Find the session that owns this refresh token hash
    const session = await this.sessionModel
      .findOne({ _id: payload.sessionId, userId: payload.sub })
      .select('+refreshTokenHash')
      .exec();

    if (!session) {
      // Session not found at all — possible reuse, revoke all sessions for safety
      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { $set: { isRevoked: true, updatedAt: new Date() } },
      );
      this.logger.warn(
        `Refresh token reuse detected for user=${payload.sub}. All sessions revoked.`,
      );
      await this.auditLogs.createSecurityEvent({
        eventType: 'INVALID_TOKEN_USAGE',
        severity: 'CRITICAL',
        userId: payload.sub,
        ipAddress: ip,
        userAgent,
        details: { reason: 'Refresh token reuse detected' },
      });
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked. Please sign in again.',
      );
    }

    // Verify the hash matches what is stored on the session
    const sessionPlain = session.toObject ? session.toObject() : (session as any);
    if (!this.safeCompare(incomingHash, sessionPlain.refreshTokenHash ?? '')) {
      // Hash mismatch — treat as reuse
      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { $set: { isRevoked: true, updatedAt: new Date() } },
      );
      this.logger.warn(
        `Refresh token hash mismatch for user=${payload.sub}. All sessions revoked.`,
      );
      await this.auditLogs.createSecurityEvent({
        eventType: 'INVALID_TOKEN_USAGE',
        severity: 'CRITICAL',
        userId: payload.sub,
        ipAddress: ip,
        userAgent,
        details: { reason: 'Refresh token hash mismatch' },
      });
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked. Please sign in again.',
      );
    }

    if (session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired or been revoked.');
    }

    // Load user
    const userDoc = await this.userModel
      .findOne({ _id: payload.sub })
      .select('+passwordHash +mfaSecret')
      .exec();
    if (!userDoc || !userDoc.isActive) {
      throw new UnauthorizedException('User account not found or deactivated.');
    }
    const user = docToUserRow(userDoc);

    // Rotate: revoke old session, create new one
    await this.sessionModel.updateOne(
      { _id: session._id },
      { $set: { isRevoked: true, updatedAt: new Date() } },
    );

    const newSessionId = uuidv4();
    const newSessionExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
    const accessToken = this.generateAccessToken(user, newSessionId);
    const newRawRefreshToken = this.generateRefreshTokenJwt(user.id, newSessionId);
    const newHash = this.hashToken(newRawRefreshToken);
    const now = new Date();

    await this.sessionModel.create({
      _id: newSessionId,
      userId: user.id,
      refreshTokenHash: newHash,
      isRevoked: false,
      expiresAt: newSessionExpiresAt,
      ipAddress: ip,
      userAgent,
      deviceId: sessionPlain.deviceId ?? null,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.auditLogs.log({
      eventType: 'AUTH_TOKEN_REFRESH',
      userId: user.id,
      sessionId: newSessionId,
      ipAddress: ip,
      userAgent,
      result: 'success',
    });

    return { accessToken, refreshToken: newRawRefreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }

  // ── Forgot Password ───────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const safeMessage =
      'If an account with that email exists, a password reset link has been sent.';

    const doc = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();

    if (!doc || !doc.isActive) {
      await argon2.hash('dummy-timing-prevention', ARGON2_OPTIONS);
      return { message: safeMessage };
    }

    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);

    await this.userModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          resetTokenHash: tokenHash,
          resetTokenExpiresAt,
          updatedAt: new Date(),
        },
      },
    );

    await this.auditLogs.log({
      eventType: 'AUTH_PASSWORD_RESET_REQUEST',
      userId: doc._id as string,
      result: 'success',
    });

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(`[DEV ONLY] Password reset token for ${email}: ${rawToken}`);
    }

    return { message: safeMessage };
  }

  // ── Reset Password ────────────────────────────────────────────────────────

  async resetPassword(tokenPlaintext: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(tokenPlaintext);

    const doc = await this.userModel
      .findOne({ resetTokenHash: tokenHash })
      .select('+resetTokenHash +passwordHash')
      .exec();

    if (!doc) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (!doc.resetTokenExpiresAt || doc.resetTokenExpiresAt < new Date()) {
      // Clear the stale token
      await this.userModel.updateOne(
        { _id: doc._id },
        { $set: { resetTokenHash: null, resetTokenExpiresAt: null, updatedAt: new Date() } },
      );
      throw new BadRequestException('Password reset token has expired. Please request a new one.');
    }

    const passwordHash = await this.hashPassword(newPassword);
    const now = new Date();

    await this.userModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: now,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          updatedAt: now,
        },
      },
    );

    // Revoke all sessions after password reset
    await this.sessionModel.updateMany(
      { userId: doc._id as string },
      { $set: { isRevoked: true, updatedAt: now } },
    );

    await this.auditLogs.log({
      eventType: 'AUTH_PASSWORD_RESET_COMPLETE',
      userId: doc._id as string,
      result: 'success',
    });
    return { message: 'Password reset successfully. Please sign in with your new password.' };
  }

  // ── Change Password ───────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string,
  ): Promise<{ message: string }> {
    const doc = await this.userModel.findOne({ _id: userId }).select('+passwordHash').exec();
    if (!doc) throw new NotFoundException('User not found.');

    const user = docToUserRow(doc);

    const isValid = await this.verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect.');

    const isSame = await this.verifyPassword(user.passwordHash, newPassword);
    if (isSame)
      throw new BadRequestException('New password must differ from the current password.');

    const passwordHash = await this.hashPassword(newPassword);
    const now = new Date();

    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: now,
        },
      },
    );

    // Revoke all sessions except the current one
    await this.sessionModel.updateMany(
      { userId, isRevoked: false, _id: { $ne: currentSessionId } },
      { $set: { isRevoked: true, updatedAt: now } },
    );

    await this.auditLogs.log({ eventType: 'AUTH_PASSWORD_CHANGE', userId, result: 'success' });
    return { message: 'Password changed. Other sessions have been signed out.' };
  }

  // ── MFA ───────────────────────────────────────────────────────────────────

  async setupMfa(userId: string): Promise<MfaSetupResponseDto> {
    const doc = await this.userModel.findOne({ _id: userId }).select('+mfaSecret').exec();
    if (!doc) throw new NotFoundException('User not found.');

    const user = docToUserRow(doc);

    const secret = speakeasy.generateSecret({
      name: `Medivault (${user.email})`,
      issuer: 'Medivault',
      length: 32,
    });

    const encryptedSecret = this.encryptMfaSecret(secret.base32);
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { mfaSecret: encryptedSecret, mfaEnabled: false, updatedAt: new Date() } },
    );

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

    const dto = new MfaSetupResponseDto();
    dto.otpauthUrl = secret.otpauth_url!;
    dto.secret = secret.base32;
    dto.qrCodeDataUrl = qrCodeDataUrl;
    dto.message =
      'Scan the QR code with your authenticator app, then verify with a code to activate MFA.';
    return dto;
  }

  async verifyAndActivateMfa(userId: string, totpCode: string): Promise<{ message: string }> {
    const doc = await this.userModel.findOne({ _id: userId }).select('+mfaSecret').exec();
    if (!doc) throw new NotFoundException('User not found.');
    const user = docToUserRow(doc);
    if (!user.mfaSecret) throw new BadRequestException('MFA setup not initiated.');

    const plainSecret = this.decryptMfaSecret(user.mfaSecret);
    const isValid = speakeasy.totp.verify({
      secret: plainSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code.');

    await this.userModel.updateOne(
      { _id: userId },
      { $set: { mfaEnabled: true, updatedAt: new Date() } },
    );
    await this.auditLogs.log({ eventType: 'AUTH_MFA_VERIFY', userId, result: 'success' });
    return { message: 'MFA has been enabled for your account.' };
  }

  async disableMfa(userId: string, totpCode: string): Promise<{ message: string }> {
    const doc = await this.userModel.findOne({ _id: userId }).select('+mfaSecret').exec();
    if (!doc) throw new NotFoundException('User not found.');
    const user = docToUserRow(doc);
    if (!user.mfaSecret) throw new BadRequestException('MFA is not enabled.');

    const plainSecret = this.decryptMfaSecret(user.mfaSecret);
    const isValid = speakeasy.totp.verify({
      secret: plainSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code.');

    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: '[]',
          updatedAt: new Date(),
        },
      },
    );
    return { message: 'MFA has been disabled.' };
  }

  async verifyMfaAndEnable(userId: string, code: string): Promise<{ message: string }> {
    return this.verifyAndActivateMfa(userId, code);
  }

  private async verifyTotpCode(user: UserRow, code: string): Promise<void> {
    if (!user.mfaSecret) throw new BadRequestException('MFA secret not configured.');
    const plainSecret = this.decryptMfaSecret(user.mfaSecret);
    const isValid = speakeasy.totp.verify({
      secret: plainSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!isValid) throw new UnauthorizedException('Invalid MFA code.');
  }

  // ── MFA Encryption ────────────────────────────────────────────────────────

  private encryptMfaSecret(plaintext: string): string {
    const key = this.getMfaEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  private decryptMfaSecret(stored: string): string {
    if (!stored.includes(':')) {
      this.logger.warn('Decrypting legacy unencrypted MFA secret — please re-enroll MFA.');
      return stored;
    }
    const parts = stored.split(':');
    if (parts.length !== 3) throw new UnauthorizedException('Malformed MFA secret.');
    const [ivHex, ciphertextHex, authTagHex] = parts;
    const key = this.getMfaEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private getMfaEncryptionKey(): Buffer {
    const raw =
      this.configService.get<string>('MFA_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_ACCESS_SECRET', 'insecure-fallback-change-in-prod');
    return createHash('sha256').update(raw).digest();
  }

  // ── Email Verification ────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);

    const doc = await this.userModel
      .findOne({ emailVerificationTokenHash: tokenHash })
      .select('+emailVerificationTokenHash')
      .exec();

    if (!doc) {
      throw new BadRequestException('Invalid or expired email verification token.');
    }
    if (!doc.emailVerificationTokenExpiresAt || doc.emailVerificationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Email verification token has expired.');
    }

    await this.userModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          isEmailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationTokenExpiresAt: null,
          updatedAt: new Date(),
        },
      },
    );
    return { message: 'Email verified successfully.' };
  }

  // ── Current User & Sessions ───────────────────────────────────────────────

  async getCurrentUser(userId: string): Promise<UserInfoDto> {
    const doc = await this.userModel.findOne({ _id: userId }).exec();
    if (!doc) throw new NotFoundException('User not found.');
    return this.mapUserToInfoDto(docToUserRow(doc));
  }

  async getSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.sessionModel
      .find({ userId, isRevoked: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return sessions.map((s: any) => ({
      id: s._id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt ?? s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s._id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionModel.updateOne(
      { _id: sessionId, userId },
      { $set: { isRevoked: true, updatedAt: new Date() } },
    );
  }

  async getUserById(userId: string): Promise<UserRow | null> {
    const doc = await this.userModel
      .findOne({ _id: userId })
      .select('+passwordHash +mfaSecret')
      .exec();
    return doc ? docToUserRow(doc) : null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  mapUserToInfoDto(user: UserRow): UserInfoDto {
    const dto = new UserInfoDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.username = user.username;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.role = user.role as UserRole;
    dto.organizationId = user.organizationId ?? null;
    dto.facilityId = user.facilityId;
    dto.hospital = user.hospital ?? null;
    dto.isEmailVerified = Boolean(user.isEmailVerified);
    dto.isMfaEnabled = Boolean(user.mfaEnabled);
    dto.lastLoginAt = user.lastLoginAt;
    return dto;
  }
}
