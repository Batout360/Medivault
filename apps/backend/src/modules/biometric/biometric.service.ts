import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  BiometricProvider,
  BiometricCaptureData,
  BiometricTemplateGalleryItem,
  BIOMETRIC_PROVIDER,
} from './providers/biometric-provider.interface';
import { BiometricSecurityService } from './services/biometric-security.service';
import { BiometricTemplate, BiometricTemplateDocument } from './schemas/biometric-template.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { EnrollBiometricDto, IdentifyBiometricDto, VerifyBiometricDto } from './dto/biometric.dto';
import { createHash, createDecipheriv, randomBytes, createCipheriv } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/** Poor-quality threshold — reject enrollments below this */
const MIN_QUALITY = 40;

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);
  private readonly matchThreshold: number;
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(BIOMETRIC_PROVIDER) private readonly provider: BiometricProvider,
    @InjectModel(BiometricTemplate.name)
    private readonly templateModel: Model<BiometricTemplateDocument>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    private readonly auditLogs: AuditLogsService,
    private readonly security: BiometricSecurityService,
    private readonly config: ConfigService,
  ) {
    this.matchThreshold = config.get<number>('BIOMETRIC_MATCH_THRESHOLD', 85);

    const keyMaterial = config.get<string>('BIOMETRIC_ENCRYPTION_KEY', '');
    if (!keyMaterial || keyMaterial.length < 32) {
      this.logger.warn(
        'BIOMETRIC_ENCRYPTION_KEY is missing or too short — falling back to a derived key. ' +
          'Set a 32+ character random value in production.',
      );
    }
    this.encryptionKey = createHash('sha256')
      .update(keyMaterial || 'insecure-dev-key-change-in-production')
      .digest();
  }

  // ── Encryption helpers ─────────────────────────────────────────────────────

  private encryptBuffer(plaintext: Buffer): { ciphertext: Buffer; iv: Buffer } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = (cipher as any).getAuthTag();
    const ciphertext = Buffer.concat([encrypted, authTag]);
    return { ciphertext, iv };
  }

  /** Reverse of encryptBuffer — used only to build the in-memory match gallery. */
  private decryptTemplateData(stored: string): string {
    const raw = Buffer.from(stored, 'base64');
    const iv = raw.subarray(0, 16);
    const authTag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(16, raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('base64');
  }

  /** Load active templates and decrypt them into a transient match gallery. */
  private async loadGallery(patientId?: string): Promise<BiometricTemplateGalleryItem[]> {
    const query = patientId ? { patientId, isActive: true } : { isActive: true };
    const templates = await this.templateModel.find(query).lean().exec();
    return templates.map((t) => {
      let templatePayload = '';
      try {
        templatePayload = this.decryptTemplateData(t.templateData);
      } catch {
        this.logger.warn(`Skipping un-decryptable template ${t._id} for patient ${t.patientId}`);
      }
      return {
        templateId: String(t._id),
        patientId: t.patientId,
        templatePayload,
        format: 'ISO_19794_2',
        quality: 0,
      };
    });
  }

  // ── Enroll ─────────────────────────────────────────────────────────────────

  async enroll(
    dto: EnrollBiometricDto,
    enrolledById: string,
    organizationId: string,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const patient = await this.patientModel
      .findOne({ _id: dto.patientId, organizationId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient not found in this organization.');

    if (dto.quality < MIN_QUALITY) {
      throw new BadRequestException(
        `Biometric quality ${dto.quality}% is below minimum threshold ${MIN_QUALITY}%. Please rescan.`,
      );
    }

    const captureData: BiometricCaptureData = {
      templatePayload: dto.templatePayload,
      format: dto.format,
      quality: dto.quality,
      deviceId: dto.deviceId,
      capturedAt: dto.capturedAt,
      bridgeSignature: dto.bridgeSignature,
    };

    const verified = await this.security.verifyAndDecrypt(captureData, {
      userId: enrolledById,
      organizationId,
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });
    captureData.templatePayload = verified.templatePayload;

    const result = await this.provider.enroll(dto.patientId, captureData);
    if (!result.success) {
      throw new BadRequestException(result.message ?? 'Biometric enrollment failed.');
    }

    const templateBuffer = Buffer.from(verified.templatePayload, 'base64');
    const templateHash = createHash('sha256').update(templateBuffer).digest('hex');
    const { ciphertext: encryptedTemplate, iv } = this.encryptBuffer(templateBuffer);

    const now = new Date();
    await new this.templateModel({
      _id: uuidv4(),
      patientId: dto.patientId,
      // Store encrypted template as base64 string (templateData field is select:false)
      templateData: Buffer.concat([iv, encryptedTemplate]).toString('base64'),
      templateVersion: templateHash,
      enrolledById,
      deviceId: dto.deviceId ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }).save();

    await this.auditLogs.log({
      eventType: 'BIOMETRIC_ENROLL',
      userId: enrolledById,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: dto.patientId,
      action: 'ENROLL_BIOMETRIC',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        templateType: (dto as any).templateType,
        quality: dto.quality,
        deviceId: dto.deviceId,
      },
    });

    return {
      success: true,
      quality: result.quality,
      templateType: (dto as any).templateType,
      message: 'Biometric enrolled successfully.',
    };
  }

  // ── Identify (1:N search) ──────────────────────────────────────────────────

  async identify(
    dto: IdentifyBiometricDto,
    requestContext: { ip: string; userAgent: string; requestId?: string },
  ) {
    if (dto.quality < MIN_QUALITY) {
      throw new BadRequestException(`Sample quality ${dto.quality}% is too low. Please rescan.`);
    }

    const captureData: BiometricCaptureData = {
      templatePayload: dto.templatePayload,
      format: dto.format,
      quality: dto.quality,
      deviceId: dto.deviceId,
      capturedAt: dto.capturedAt,
      bridgeSignature: dto.bridgeSignature,
    };

    const verified = await this.security.verifyAndDecrypt(captureData, {
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });
    captureData.templatePayload = verified.templatePayload;

    const gallery = await this.loadGallery();
    const result = await this.provider.identify(captureData, gallery);

    const auditPayload = {
      eventType: 'BIOMETRIC_VERIFY',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      action: 'IDENTIFY_BIOMETRIC',
      metadata: { deviceId: dto.deviceId, quality: dto.quality },
    };

    if (!result.matched || !result.patientId) {
      await this.auditLogs.log({
        ...auditPayload,
        result: 'failure',
        metadata: { ...auditPayload.metadata, reason: 'No match found' },
      });
      return { matched: false, message: 'Fingerprint could not be matched.' };
    }

    const patient = await this.patientModel
      .findOne({ _id: result.patientId, isActive: true, deletedAt: null })
      .lean()
      .exec();

    if (!patient) {
      await this.auditLogs.log({
        ...auditPayload,
        result: 'failure',
        metadata: { ...auditPayload.metadata, reason: 'Patient not found' },
      });
      return { matched: false, message: 'Fingerprint could not be matched.' };
    }

    await this.auditLogs.log({
      ...auditPayload,
      resourceType: 'PATIENT',
      resourceId: String(patient._id),
      result: 'success',
    });

    this.logger.log(`Biometric identification: patient=${patient._id} score=${result.score}`);

    return {
      matched: true,
      patientId: patient._id,
      confidence: Math.round((result.score ?? 95) * 10) / 10,
      message: 'Patient identified. Authorization required to access records.',
    };
  }

  // ── Verify (1:1 check) ─────────────────────────────────────────────────────

  async verify(
    patientId: string,
    dto: VerifyBiometricDto,
    organizationId: string,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const patient = await this.patientModel
      .findOne({ _id: patientId, organizationId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient not found.');

    const captureData: BiometricCaptureData = {
      templatePayload: dto.templatePayload,
      format: dto.format,
      quality: dto.quality,
      deviceId: dto.deviceId,
      capturedAt: dto.capturedAt,
      bridgeSignature: dto.bridgeSignature,
    };

    const verified = await this.security.verifyAndDecrypt(captureData, {
      userId: undefined,
      organizationId,
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });
    captureData.templatePayload = verified.templatePayload;

    const gallery = await this.loadGallery(patientId);
    const result = await this.provider.verify(patientId, captureData, gallery);

    await this.auditLogs.log({
      eventType: 'BIOMETRIC_VERIFY',
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VERIFY_BIOMETRIC',
      result: result.matched ? 'success' : 'failure',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return { matched: result.matched, score: result.score };
  }

  // ── Revoke Template ────────────────────────────────────────────────────────

  async revokeTemplate(
    templateId: string,
    revokedById: string,
    organizationId: string,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    // Load template and verify org ownership via patient
    const template = await this.templateModel
      .findOne({ _id: templateId, isActive: true })
      .lean()
      .exec();

    if (!template) throw new NotFoundException('Biometric template not found.');

    // Verify the patient belongs to the requesting organization
    const patient = await this.patientModel
      .findOne({ _id: template.patientId, organizationId })
      .lean()
      .exec();

    if (!patient) throw new NotFoundException('Biometric template not found.');

    const now = new Date();
    await this.templateModel
      .findOneAndUpdate({ _id: templateId }, { $set: { isActive: false, updatedAt: now } })
      .exec();

    await this.provider.deleteTemplates(template.patientId);

    await this.auditLogs.log({
      eventType: 'BIOMETRIC_REVOKE',
      userId: revokedById,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: template.patientId,
      action: 'REVOKE_BIOMETRIC',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return { message: 'Biometric template revoked.' };
  }

  // ── List Templates (metadata only) ────────────────────────────────────────

  async listTemplates(patientId: string, organizationId: string) {
    const patient = await this.patientModel
      .findOne({ _id: patientId, organizationId, deletedAt: null })
      .lean()
      .exec();
    if (!patient) throw new NotFoundException('Patient not found.');

    return (
      this.templateModel
        .find({ patientId, isActive: true })
        // templateData is select:false — omit from projection explicitly
        .select('-templateData')
        .lean()
        .exec()
    );
  }

  // ── Health Check ───────────────────────────────────────────────────────────

  async healthCheck() {
    const healthy = await this.provider.healthCheck();
    return { healthy, provider: 'mfs100' };
  }
}
