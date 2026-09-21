import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';

import { MedicalProfile, MedicalProfileDocument, QrStatus } from './schemas/medical-profile.schema';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import {
  EmergencyContact,
  PatientAllergy,
  PatientCondition,
} from '../patients/schemas/patient.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccessTokenPayload } from '../../auth/auth.service';

/** Entropy (bytes) of the raw QR scan code — roughly 144 bits of randomness. */
const QR_CODE_BYTES = 18;
/** Width in px of the generated QR PNG. */
const QR_PNG_SIZE = 640;

export type RequestContext = {
  ip: string;
  userAgent: string;
  requestId: string;
};

@Injectable()
export class MedicalProfileService {
  private readonly logger = new Logger(MedicalProfileService.name);

  constructor(
    @InjectModel(MedicalProfile.name)
    private readonly medicalProfileModel: Model<MedicalProfileDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    private readonly auditLogs: AuditLogsService,
    private readonly configService: ConfigService,
  ) {}

  // ── Get the full card (authenticated + authorized) ─────────────────────────

  async getCard(
    patientId: string,
    orgId: string | null,
    user: AccessTokenPayload,
    context: RequestContext,
  ) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const profile = await this.medicalProfileModel.findOne({ patientId }).lean().exec();
    const isActive = !!profile && profile.qrStatus === QrStatus.ACTIVE;

    const card = {
      patient: {
        id: patient._id,
        profileId: patient.profileId ?? null,
        patientId: patient.patientId ?? null,
        mrn: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup ?? null,
        phoneNumber: patient.phoneNumber ?? null,
        email: patient.email ?? null,
        city: patient.city ?? null,
        state: patient.state ?? null,
        pincode: patient.pincode ?? null,
      },
      allergies: (patient.allergies ?? [])
        .filter((a: PatientAllergy) => a.isActive)
        .map((a: PatientAllergy) => ({
          id: a.id,
          allergen: a.allergen,
          allergyType: a.allergyType ?? null,
          severity: a.severity ?? null,
          reaction: a.reaction ?? null,
        })),
      conditions: (patient.conditions ?? [])
        .filter((c: PatientCondition) => c.status === 'ACTIVE')
        .map((c: PatientCondition) => ({
          id: c.id,
          conditionName: c.conditionName,
          status: c.status,
          notes: c.notes ?? null,
        })),
      emergencyContacts: (patient.emergencyContacts ?? [])
        .filter((ec: EmergencyContact) => ec.isActive)
        .map((ec: EmergencyContact) => ({
          id: ec.id,
          name: ec.name,
          relationship: ec.relationship,
          phone: ec.phone,
          email: ec.email ?? null,
        })),
      qr: {
        status: profile ? profile.qrStatus : 'NOT_CREATED',
        scanCount: profile?.scanCount ?? 0,
        lastScannedAt: profile?.lastScannedAt ?? null,
        qrCreatedAt: profile?.qrCreatedAt ?? null,
        qrRevokedAt: profile?.qrRevokedAt ?? null,
        payloadUrl: isActive && profile?.qrCodeEnc ? this.buildPayloadUrl(profile) : null,
      },
      visibility: {
        showName: profile?.visibility?.showName ?? true,
        showPhoto: profile?.visibility?.showPhoto ?? true,
        showBloodType: profile?.visibility?.showBloodType ?? true,
        showAllergies: profile?.visibility?.showAllergies ?? false,
        showConditions: profile?.visibility?.showConditions ?? false,
        showEmergencyContact: profile?.visibility?.showEmergencyContact ?? false,
        showMedications: profile?.visibility?.showMedications ?? false,
      },
    };

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_VIEW',
      userId: user.sub,
      userRole: user.role,
      organizationId: orgId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VIEW_MEDICAL_CARD',
      result: 'success',
      metadata: { qrStatus: card.qr.status },
    });

    return card;
  }

  // ── Generate / regenerate the QR ───────────────────────────────────────────

  async generateQr(
    patientId: string,
    orgId: string | null,
    user: AccessTokenPayload,
    requestedBaseUrl: string | undefined,
    context: RequestContext,
  ) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const b64BaseUrl = requestedBaseUrl?.trim().replace(/\/+$/, '');
    if (b64BaseUrl && !/^https?:\/\//.test(b64BaseUrl)) {
      throw new BadRequestException('baseUrl must be an absolute http(s) URL.');
    }
    const baseUrl = b64BaseUrl || this.defaultBaseUrl();

    const code = randomBytes(QR_CODE_BYTES).toString('base64url');
    const payloadUrl = `${baseUrl}/verify/${code}`;

    const existing = await this.medicalProfileModel.findOne({ patientId }).lean().exec();
    const isRegeneration = existing?.qrStatus === QrStatus.ACTIVE;
    const previousScanCount = existing?.scanCount ?? 0;

    const now = new Date();
    await this.medicalProfileModel.findOneAndUpdate(
      { patientId },
      {
        $set: {
          organizationId: orgId,
          qrStatus: QrStatus.ACTIVE,
          mvId: patient.profileId ? this.formatMvId(patient.profileId) : null,
          qrCodeHash: this.hash(code),
          qrCodeEnc: this.encrypt(code),
          qrBaseUrl: baseUrl,
          scanCount: 0,
          lastScannedAt: null,
          qrCreatedAt: now,
          qrRevokedAt: null,
          qrRevokedById: null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: uuidv4(),
          createdAt: now,
        },
      },
      { upsert: true },
    );

    const qrDataUrl = await QRCode.toDataURL(payloadUrl, {
      type: 'image/png',
      width: QR_PNG_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    await this.auditLogs.log({
      eventType: isRegeneration ? 'MEDICAL_CARD_QR_REGENERATE' : 'MEDICAL_CARD_QR_GENERATE',
      userId: user.sub,
      userRole: user.role,
      organizationId: orgId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: isRegeneration ? 'REGENERATE_QR' : 'GENERATE_QR',
      result: 'success',
      metadata: {
        isRegeneration,
        previousScanCount: isRegeneration ? previousScanCount : undefined,
        codeHashPrefix: this.hash(code).slice(0, 12),
      },
    });

    this.logger.log(
      `Medical profile QR ${isRegeneration ? 'regenerated' : 'generated'} for patient ${patientId}`,
    );

    return {
      patientId,
      status: QrStatus.ACTIVE,
      regenerated: isRegeneration,
      payloadUrl,
      qrDataUrl,
    };
  }

  // ── Revoke ─────────────────────────────────────────────────────────────────

  async revokeQr(
    patientId: string,
    orgId: string | null,
    user: AccessTokenPayload,
    context: RequestContext,
  ) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const profile = await this.medicalProfileModel.findOne({ patientId }).exec();
    if (!profile) {
      throw new NotFoundException(
        'No medical profile QR exists for this patient. Generate one first.',
      );
    }
    if (profile.qrStatus !== QrStatus.ACTIVE) {
      throw new BadRequestException('The current medical profile QR is already revoked.');
    }

    const now = new Date();
    await this.medicalProfileModel.findOneAndUpdate(
      { _id: profile._id },
      {
        $set: {
          qrStatus: QrStatus.REVOKED,
          qrRevokedAt: now,
          qrRevokedById: user.sub,
          updatedAt: now,
        },
      },
    );

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_QR_REVOKE',
      userId: user.sub,
      userRole: user.role,
      organizationId: orgId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'REVOKE_QR',
      result: 'success',
      metadata: { scanCountAtRevoke: profile.scanCount },
    });

    this.logger.warn(`Medical profile QR revoked for patient ${patientId} by ${user.sub}`);
    return {
      message: 'Medical profile QR revoked. Anyone scanning it will no longer see the profile.',
      status: QrStatus.REVOKED,
    };
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getQrStatus(
    patientId: string,
    orgId: string | null,
    user: AccessTokenPayload,
    context: RequestContext,
  ) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const profile = await this.medicalProfileModel.findOne({ patientId }).lean().exec();
    if (!profile) {
      return {
        status: 'NOT_CREATED',
        scanCount: 0,
        lastScannedAt: null,
        qrCreatedAt: null,
        qrRevokedAt: null,
        payloadUrl: null,
      };
    }

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_QR_STATUS',
      userId: user.sub,
      userRole: user.role,
      organizationId: orgId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VIEW_QR_STATUS',
      result: 'success',
      metadata: { qrStatus: profile.qrStatus, scanCount: profile.scanCount },
    });

    return {
      status: profile.qrStatus,
      scanCount: profile.scanCount,
      lastScannedAt: profile.lastScannedAt,
      qrCreatedAt: profile.qrCreatedAt,
      qrRevokedAt: profile.qrRevokedAt,
      payloadUrl:
        profile.qrStatus === QrStatus.ACTIVE && profile.qrCodeEnc
          ? this.buildPayloadUrl(profile)
          : null,
    };
  }

  // ── QR PNG (point-in-time render for download) ─────────────────────────────

  async getQrPng(patientId: string, orgId: string | null, user: AccessTokenPayload) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const profile = await this.medicalProfileModel.findOne({ patientId }).lean().exec();
    if (!profile || profile.qrStatus !== QrStatus.ACTIVE || !profile.qrCodeEnc) {
      throw new NotFoundException(
        profile?.qrStatus === QrStatus.REVOKED
          ? 'This QR code has been revoked and can no longer be downloaded.'
          : 'No active QR code exists for this patient. Generate one first.',
      );
    }

    const payloadUrl = this.buildPayloadUrl(profile);
    const buffer = await QRCode.toBuffer(payloadUrl, {
      type: 'png',
      width: QR_PNG_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return {
      buffer,
      mimeType: 'image/png',
      fileName: `medical-card-qr-${patient.mrn}.png`,
    };
  }

  // ── Public verification (scan tracking) ────────────────────────────────────

  async verifyScan(code: string, context: RequestContext) {
    const scannedAt = new Date();
    const codeHash = this.hash(code);
    const profile = await this.medicalProfileModel.findOne({ qrCodeHash: codeHash }).lean().exec();

    if (!profile) {
      return { valid: false, status: 'INVALID', scannedAt };
    }
    if (profile.qrStatus !== QrStatus.ACTIVE) {
      await this.auditLogs.log({
        eventType: 'MEDICAL_CARD_QR_SCAN',
        organizationId: profile.organizationId,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        resourceType: 'PATIENT',
        resourceId: profile.patientId,
        action: 'QR_SCAN',
        result: 'denied',
        metadata: {
          qrStatus: profile.qrStatus,
          reason: 'invalid_or_revoked_code',
        },
      });
      return { valid: false, status: profile.qrStatus, scannedAt };
    }

    await this.medicalProfileModel
      .findOneAndUpdate(
        { _id: profile._id },
        {
          $inc: { scanCount: 1 },
          $set: { lastScannedAt: scannedAt, updatedAt: scannedAt },
        },
      )
      .exec();

    const patient = await this.patientModel.findOne({ _id: profile.patientId }).lean().exec();

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_QR_SCAN',
      organizationId: profile.organizationId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: profile.patientId,
      action: 'QR_SCAN',
      result: 'success',
      metadata: { scanCountAfter: (profile.scanCount ?? 0) + 1 },
    });

    return {
      valid: true,
      status: 'ACTIVE',
      scannedAt,
      hint: patient
        ? {
            initials: this.initialsOf(patient.firstName, patient.lastName),
          }
        : null,
    };
  }

  // ── Authorized details for the verification page ───────────────────────────

  async verifyAndGetCard(code: string, user: AccessTokenPayload, context: RequestContext) {
    const profile = await this.medicalProfileModel
      .findOne({ qrCodeHash: this.hash(code) })
      .lean()
      .exec();
    if (!profile || profile.qrStatus !== QrStatus.ACTIVE) {
      throw new NotFoundException('This medical profile QR code is invalid or has been revoked.');
    }

    const patient = await this.patientModel
      .findOne({ _id: profile.patientId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient record not found.');

    this.assertAccess(patient, user);

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_VERIFY_VIEW',
      userId: user.sub,
      userRole: user.role,
      organizationId: patient.organizationId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'VERIFY_QR_AND_VIEW',
      result: 'success',
    });

    const card = await this.getCard(patient._id, patient.organizationId, user, context);
    return { patientId: patient._id, card };
  }

  // ── Update visibility settings ─────────────────────────────────────────────

  async updateVisibility(
    patientId: string,
    orgId: string | null,
    user: AccessTokenPayload,
    dto: UpdateVisibilityDto,
    context: RequestContext,
  ) {
    const patient = await this.loadPatient(patientId, orgId);
    this.assertAccess(patient, user);

    const now = new Date();
    const visibilityUpdate: Record<string, unknown> = {};
    if (dto.showName !== undefined) visibilityUpdate['visibility.showName'] = dto.showName;
    if (dto.showPhoto !== undefined) visibilityUpdate['visibility.showPhoto'] = dto.showPhoto;
    if (dto.showBloodType !== undefined)
      visibilityUpdate['visibility.showBloodType'] = dto.showBloodType;
    if (dto.showAllergies !== undefined)
      visibilityUpdate['visibility.showAllergies'] = dto.showAllergies;
    if (dto.showConditions !== undefined)
      visibilityUpdate['visibility.showConditions'] = dto.showConditions;
    if (dto.showEmergencyContact !== undefined)
      visibilityUpdate['visibility.showEmergencyContact'] = dto.showEmergencyContact;
    if (dto.showMedications !== undefined)
      visibilityUpdate['visibility.showMedications'] = dto.showMedications;
    visibilityUpdate['updatedAt'] = now;

    await this.medicalProfileModel.findOneAndUpdate(
      { patientId },
      {
        $set: visibilityUpdate,
        $setOnInsert: {
          _id: uuidv4(),
          organizationId: orgId,
          qrStatus: QrStatus.ACTIVE,
          qrCodeHash: null,
          qrCodeEnc: null,
          qrBaseUrl: null,
          scanCount: 0,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    await this.auditLogs.log({
      eventType: 'MEDICAL_CARD_VISIBILITY_UPDATE',
      userId: user.sub,
      userRole: user.role,
      organizationId: orgId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'UPDATE_VISIBILITY',
      result: 'success',
      metadata: { fields: Object.keys(dto) },
    });

    return { message: 'Visibility settings updated.' };
  }

  // ── Public profile (QR scan — visibility-filtered, no auth required) ────────

  async getPublicProfile(code: string, context: RequestContext) {
    const scannedAt = new Date();
    const codeHash = this.hash(code);
    const profile = await this.medicalProfileModel.findOne({ qrCodeHash: codeHash }).lean().exec();

    if (!profile) {
      return { valid: false, status: 'INVALID' as const, scannedAt };
    }
    if (profile.qrStatus !== QrStatus.ACTIVE) {
      await this.auditLogs.log({
        eventType: 'PUBLIC_PROFILE_SCAN',
        organizationId: profile.organizationId,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        resourceType: 'PATIENT',
        resourceId: profile.patientId,
        action: 'PUBLIC_PROFILE_SCAN',
        result: 'denied',
        metadata: { qrStatus: profile.qrStatus, reason: 'revoked_or_invalid' },
      });
      return { valid: false, status: profile.qrStatus as 'REVOKED', scannedAt };
    }

    // Increment scan count
    await this.medicalProfileModel
      .findOneAndUpdate(
        { _id: profile._id },
        {
          $inc: { scanCount: 1, publicViewCount: 1 },
          $set: { lastScannedAt: scannedAt, lastPublicViewAt: scannedAt, updatedAt: scannedAt },
        },
      )
      .exec();

    const patient = await this.patientModel
      .findOne({ _id: profile.patientId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) {
      return { valid: false, status: 'INVALID' as const, scannedAt };
    }

    const vis = (profile.visibility ?? {}) as Record<string, boolean>;
    // Default: show name and blood type; hide everything else unless explicitly enabled
    const showName = vis['showName'] !== false;
    const showBloodType = vis['showBloodType'] !== false;
    const showAllergies = vis['showAllergies'] === true;
    const showConditions = vis['showConditions'] === true;
    const showEmergencyContact = vis['showEmergencyContact'] === true;

    const criticalSeverities = new Set(['SEVERE', 'LIFE_THREATENING', 'HIGH', 'CRITICAL']);

    const publicAllergies = showAllergies
      ? (patient.allergies ?? [])
          .filter((a: any) => a.isActive)
          .map((a: any) => ({
            allergen: a.allergen,
            severity: a.severity ?? null,
            reaction: a.reaction ?? null,
            isCritical: criticalSeverities.has((a.severity ?? '').toUpperCase()),
          }))
      : [];

    const criticalAllergies = (patient.allergies ?? [])
      .filter((a: any) => a.isActive && criticalSeverities.has((a.severity ?? '').toUpperCase()))
      .map((a: any) => ({
        allergen: a.allergen,
        severity: a.severity,
        reaction: a.reaction ?? null,
      }));

    const publicConditions = showConditions
      ? (patient.conditions ?? [])
          .filter((c: any) => c.status === 'ACTIVE')
          .map((c: any) => ({ conditionName: c.conditionName, notes: c.notes ?? null }))
      : [];

    const ec = showEmergencyContact
      ? ((patient.emergencyContacts ?? []).filter((e: any) => e.isActive)[0] ?? null)
      : null;

    const mvId = profile.mvId ?? (patient.profileId ? this.formatMvId(patient.profileId) : null);

    await this.auditLogs.log({
      eventType: 'PUBLIC_PROFILE_SCAN',
      organizationId: profile.organizationId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'PUBLIC_PROFILE_VIEW',
      result: 'success',
      metadata: { publicViewCount: (profile.publicViewCount ?? 0) + 1 },
    });

    return {
      valid: true,
      status: 'ACTIVE' as const,
      scannedAt,
      patientId: patient.patientId ?? null,
      mvId,
      patient: {
        firstName: showName ? patient.firstName : null,
        lastName: showName ? patient.lastName : null,
        initials: this.initialsOf(patient.firstName, patient.lastName),
        gender: patient.gender,
        bloodGroup: showBloodType ? (patient.bloodGroup ?? null) : null,
      },
      allergies: publicAllergies,
      criticalAllergies,
      conditions: publicConditions,
      emergencyContact: ec
        ? {
            name: ec.name,
            relationship: ec.relationship,
            phone: ec.phone,
          }
        : null,
      visibility: {
        showName,
        showBloodType,
        showAllergies,
        showConditions,
        showEmergencyContact,
      },
      qr: {
        scanCount: (profile.scanCount ?? 0) + 1,
        lastScannedAt: scannedAt,
      },
    };
  }

  // ── Emergency profile (no auth — only shows patient-enabled emergency info) ─

  async getEmergencyProfile(code: string, context: RequestContext) {
    const codeHash = this.hash(code);
    const profile = await this.medicalProfileModel.findOne({ qrCodeHash: codeHash }).lean().exec();

    if (!profile || profile.qrStatus !== QrStatus.ACTIVE) {
      throw new NotFoundException('Invalid or revoked QR code.');
    }

    const patient = await this.patientModel
      .findOne({ _id: profile.patientId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient not found.');

    const vis = (profile.visibility ?? {}) as Record<string, boolean>;
    const showEmergencyContact = vis['showEmergencyContact'] === true;
    const showAllergies = vis['showAllergies'] === true;
    const showConditions = vis['showConditions'] === true;
    const showBloodType = vis['showBloodType'] !== false;

    const criticalSeverities = new Set(['SEVERE', 'LIFE_THREATENING', 'HIGH', 'CRITICAL']);

    const criticalAllergies = (patient.allergies ?? [])
      .filter((a: any) => a.isActive && criticalSeverities.has((a.severity ?? '').toUpperCase()))
      .map((a: any) => ({
        allergen: a.allergen,
        severity: a.severity,
        reaction: a.reaction ?? null,
      }));

    await this.auditLogs.log({
      eventType: 'EMERGENCY_PROFILE_ACCESS',
      organizationId: profile.organizationId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'EMERGENCY_PROFILE_VIEW',
      result: 'success',
    });

    return {
      isEmergencyView: true,
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        initials: this.initialsOf(patient.firstName, patient.lastName),
        bloodGroup: showBloodType ? (patient.bloodGroup ?? null) : null,
        gender: patient.gender,
      },
      criticalAllergies,
      allergies: showAllergies
        ? (patient.allergies ?? [])
            .filter((a: any) => a.isActive)
            .map((a: any) => ({
              allergen: a.allergen,
              severity: a.severity ?? null,
            }))
        : criticalAllergies,
      conditions: showConditions
        ? (patient.conditions ?? [])
            .filter((c: any) => c.status === 'ACTIVE')
            .map((c: any) => ({
              conditionName: c.conditionName,
            }))
        : [],
      emergencyContact: showEmergencyContact
        ? ((patient.emergencyContacts ?? []).filter((e: any) => e.isActive)[0] ?? null)
        : null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Compensating delete used by registration rollback: removes any medical
   *  profile rows belonging to patients linked to the given user account. */
  async deleteForUserId(userId: string): Promise<void> {
    const patients = await this.patientModel
      .find({ userId, deletedAt: null })
      .select('_id')
      .lean()
      .exec();
    const ids = patients.map((p) => p._id as string);
    if (ids.length === 0) return;
    await this.medicalProfileModel.deleteMany({ patientId: { $in: ids } }).exec();
  }

  private formatMvId(profileId: string): string {
    // Converts 8-char profileId like 'AB3XY9KZ' into 'MV-AB3X-Y9KZ'
    const clean = profileId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length >= 8) {
      return `MV-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    }
    // Fallback: pad with the raw profileId
    return `MV-${clean}`;
  }

  private async loadPatient(patientId: string, orgId: string | null): Promise<any> {
    const patient = await this.patientModel
      .findOne({ _id: patientId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient not found.');
    // SUPER_ADMIN (orgId === null) bypasses organization scoping entirely.
    if (orgId !== null && patient.organizationId !== orgId) {
      throw new ForbiddenException('Access denied to this patient record.');
    }
    return patient;
  }

  /**
   * Mirrors PatientAccessGuard for service-level checks (used when a route has
   * no `:patientId` param, e.g. the QR-carrying verification endpoints).
   */
  private assertAccess(patient: any, user: AccessTokenPayload): void {
    if (!user) throw new ForbiddenException('Access denied.');

    const role = user.role;
    if (role === UserRole.SUPER_ADMIN) return;

    if (user.organizationId !== patient.organizationId) {
      throw new ForbiddenException('Access denied to this patient record.');
    }

    if (['ADMIN', 'ORG_ADMIN', 'FACILITY_ADMIN'].includes(role)) return;

    if (
      [
        'DOCTOR',
        'NURSE',
        'RECEPTIONIST',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'PHARMACIST',
        'BILLING_STAFF',
      ].includes(role)
    ) {
      if (user.facilityId && user.facilityId !== patient.facilityId) {
        throw new ForbiddenException('You do not have access to patients outside your facility.');
      }
      return;
    }

    if (PATIENT_ROLES.includes(role as (typeof PATIENT_ROLES)[number])) {
      // Own-record access is enforced by matching the patient's email+org with
      // the signed-in user. Query against the loaded patient object.
      if (
        !patient.email ||
        patient.email.toLowerCase() !== user.email?.toLowerCase() ||
        patient.organizationId !== user.organizationId
      ) {
        throw new ForbiddenException('You may only access your own records.');
      }
      return;
    }

    throw new ForbiddenException('Access denied.');
  }

  private defaultBaseUrl(): string {
    const configured = this.configService.get<string>('FRONTEND_URL', '');
    return (configured || 'http://localhost:3000').replace(/\/+$/, '');
  }

  private buildPayloadUrl(profile: any): string {
    const base = (profile.qrBaseUrl ?? this.defaultBaseUrl()).replace(/\/+$/, '');
    const code = this.decrypt(profile.qrCodeEnc);
    return `${base}/verify/${code}`;
  }

  private hash(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  private initialsOf(firstName: string, lastName: string): string {
    const f = firstName?.trim().charAt(0) ?? '';
    const l = lastName?.trim().charAt(0) ?? '';
    return `${f}${l}`.toUpperCase() || 'N/A';
  }

  // ── AES-256-GCM envelope (same scheme as MFA secrets) ──────────────────────

  private getEncryptionKey(): Buffer {
    const raw =
      this.configService.get<string>('QR_ENCRYPTION_KEY') ??
      this.configService.get<string>(
        'MFA_ENCRYPTION_KEY',
        this.configService.get<string>('JWT_ACCESS_SECRET', 'insecure-fallback-change-in-prod')!,
      )!;
    return createHash('sha256').update(raw).digest();
  }

  private encrypt(plain: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  }

  private decrypt(stored: string): string {
    if (!stored || !stored.includes(':')) {
      this.logger.error('Malformed encrypted QR code payload.');
      throw new BadRequestException('QR code payload is malformed.');
    }
    const parts = stored.split(':');
    if (parts.length !== 3) throw new BadRequestException('QR code payload is malformed.');
    const [ivHex, ciphertextHex, authTagHex] = parts;
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
