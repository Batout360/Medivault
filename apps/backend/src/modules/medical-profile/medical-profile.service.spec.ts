/**
 * Unit tests for MedicalProfileService — the medical profile card + QR module.
 *
 * Covers:
 *   1. getCard       — field mapping (active allergies/conditions/contacts only),
 *                      QR summary, audit logging.
 *   2. generateQr    — first generation vs regeneration, baseUrl validation,
 *                      payload URL shape, audit logging.
 *   3. revokeQr      — NotFound (no profile), BadRequest (already revoked),
 *                      success transition to REVOKED.
 *   4. getQrStatus   — ACTIVE summary and metadata.
 *   5. getQrPng      — PNG render for an active code.
 *   6. verifyScan    — INVALID (unknown), REVOKED (denied + audit), ACTIVE
 *                      (scan-count increment + initials hint).
 *   7. verifyAndGetCard — NotFound for inactive codes, Forbidden for
 *                      cross-patient access, card for authorized viewers.
 *
 * The mocks replicate the Mongoose query builder chain used by the service
 * (findOne(...).lean().exec(), findOneAndUpdate(...).exec()).
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { Model } from 'mongoose';
import { UserRole } from '@medivault/shared';

import { MedicalProfileService, RequestContext } from './medical-profile.service';
import { MedicalProfileDocument, QrStatus } from './schemas/medical-profile.schema';
import { PatientDocument } from '../patients/schemas/patient.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AccessTokenPayload } from '../../auth/auth.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
  toBuffer: jest.fn(),
}));

const ctx: RequestContext = {
  ip: '127.0.0.1',
  userAgent: 'jest',
  requestId: 'req-1',
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePatient(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    _id: 'patient-uuid-1',
    profileId: 'MED12345',
    mrn: 'MRN-00001',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'Male',
    bloodGroup: 'O+',
    phoneNumber: '+91 98765 43210',
    email: 'john.doe@example.com',
    city: 'Mumbai',
    state: 'MH',
    pincode: '400001',
    organizationId: 'org-uuid-1',
    facilityId: 'fac-uuid-1',
    allergies: [
      {
        id: 'allergy-1',
        allergen: 'Penicillin',
        allergyType: 'DRUG',
        severity: 'HIGH',
        reaction: 'Rash',
        isActive: true,
        createdAt: new Date('2025-01-01'),
      },
      {
        id: 'allergy-2',
        allergen: 'Dextrose',
        allergyType: 'DRUG',
        severity: 'LOW',
        reaction: null,
        isActive: false,
        createdAt: new Date('2025-01-02'),
      },
    ],
    conditions: [
      {
        id: 'cond-1',
        conditionName: 'Asthma',
        status: 'ACTIVE',
        notes: null,
        createdAt: new Date('2025-01-03'),
      },
      {
        id: 'cond-2',
        conditionName: 'Old fracture',
        status: 'RESOLVED',
        notes: null,
        createdAt: new Date('2025-01-04'),
      },
    ],
    emergencyContacts: [
      {
        id: 'ec-1',
        name: 'Jane Doe',
        relationship: 'Spouse',
        phone: '+91 90000 00001',
        email: null,
        isActive: true,
        createdAt: new Date('2025-01-05'),
      },
      {
        id: 'ec-2',
        name: 'Retired contact',
        relationship: 'Friend',
        phone: '+91 90000 00002',
        email: null,
        isActive: false,
        createdAt: new Date('2025-01-06'),
      },
    ],
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    _id: 'profile-uuid-1',
    patientId: 'patient-uuid-1',
    organizationId: 'org-uuid-1',
    qrStatus: QrStatus.ACTIVE,
    // No encrypted code — getCard/getQrStatus then safely skip payloadUrl.
    qrCodeEnc: null,
    qrCodeHash: 'deadbeef',
    qrBaseUrl: null,
    scanCount: 3,
    lastScannedAt: new Date('2026-09-01T10:00:00Z'),
    qrCreatedAt: new Date('2026-09-01T09:00:00Z'),
    qrRevokedAt: null,
    qrRevokedById: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
    updatedAt: new Date('2026-09-01T09:00:00Z'),
    ...overrides,
  };
}

function makeUser(overrides: Partial<AccessTokenPayload> = {}): AccessTokenPayload {
  return {
    sub: 'user-uuid-1',
    email: 'dr.sharma@citygeneral.dev',
    role: UserRole.DOCTOR,
    sessionId: 'session-1',
    organizationId: 'org-uuid-1',
    facilityId: 'fac-uuid-1',
    jti: 'jti-1',
    ...overrides,
  };
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

/** Mongoose Query<T> chain stub — supports `.lean()`, `.exec()` and `await`. */
function queryStub(result: unknown) {
  const exec = jest.fn(async () => result);
  const q: any = {
    select: jest.fn(() => q),
    lean: jest.fn(() => q),
    sort: jest.fn(() => q),
    limit: jest.fn(() => q),
    skip: jest.fn(() => q),
    exec,
    then: (onFulfilled?: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return q;
}

function createService(
  opts: {
    profiles?: unknown[];
    patients?: unknown[];
  } = {},
) {
  const profileQueue = [...(opts.profiles ?? [])];
  const patientQueue = [...(opts.patients ?? [])];

  const findOneAndUpdateMock = jest.fn((_filter: unknown, update: unknown) =>
    queryStub({
      _id: 'profile-uuid-1',
      ...(update as Record<string, any>)?.$set,
    }),
  );

  const medicalProfileModel = {
    findOne: jest.fn(() => queryStub(profileQueue.shift())),
    findOneAndUpdate: findOneAndUpdateMock,
  } as unknown as Model<MedicalProfileDocument>;

  const patientModel = {
    findOne: jest.fn(() => queryStub(patientQueue.shift())),
  } as unknown as Model<PatientDocument>;

  const auditLogs = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogsService;

  const configService = makeConfig({
    QR_ENCRYPTION_KEY: 'k'.repeat(32),
    FRONTEND_URL: 'http://localhost:3000',
  });

  const service = new MedicalProfileService(
    medicalProfileModel,
    patientModel,
    auditLogs,
    configService,
  );

  return {
    service,
    medicalProfileModel,
    patientModel,
    findOneAndUpdateMock,
    auditLogs,
    configService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MedicalProfileService', () => {
  beforeEach(() => {
    (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    (QRCode.toBuffer as jest.Mock).mockResolvedValue(Buffer.from('png-bytes'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCard', () => {
    it('returns the mapped card with only active allergies/conditions/contacts', async () => {
      const { service, auditLogs } = createService({
        patients: [makePatient()],
        profiles: [makeProfile()],
      });

      const card = await service.getCard('patient-uuid-1', 'org-uuid-1', makeUser(), ctx);

      expect(card.patient.mrn).toBe('MRN-00001');
      expect(card.patient.profileId).toBe('MED12345');
      expect(card.allergies).toHaveLength(1);
      expect(card.allergies[0].allergen).toBe('Penicillin');
      expect(card.conditions).toHaveLength(1);
      expect(card.conditions[0].conditionName).toBe('Asthma');
      expect(card.emergencyContacts).toHaveLength(1);
      expect(card.emergencyContacts[0].name).toBe('Jane Doe');
      expect(card.qr).toEqual(expect.objectContaining({ status: QrStatus.ACTIVE, scanCount: 3 }));
      expect(card.qr.payloadUrl).toBeNull();

      // Defaults apply when the profile has not customized visibility
      expect(card.visibility).toEqual(
        expect.objectContaining({
          showName: true,
          showBloodType: true,
          showAllergies: false,
          showConditions: false,
          showEmergencyContact: false,
          showMedications: false,
        }),
      );

      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MEDICAL_CARD_VIEW',
          result: 'success',
        }),
      );
    });

    it('returns the patient-saved visibility when the profile has settings', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [
          makeProfile({
            visibility: {
              showName: false,
              showPhoto: false,
              showBloodType: true,
              showAllergies: true,
              showConditions: true,
              showEmergencyContact: true,
              showMedications: true,
            },
          }),
        ],
      });

      const card = await service.getCard('patient-uuid-1', 'org-uuid-1', makeUser(), ctx);

      expect(card.visibility).toEqual({
        showName: false,
        showPhoto: false,
        showBloodType: true,
        showAllergies: true,
        showConditions: true,
        showEmergencyContact: true,
        showMedications: true,
      });
    });

    it('throws ForbiddenException when a patient tries to read another record', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [makeProfile()],
      });

      await expect(
        service.getCard(
          'patient-uuid-1',
          'org-uuid-1',
          makeUser({
            role: UserRole.PATIENT,
            email: 'someone.else@example.com',
          }),
          ctx,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('generateQr', () => {
    it('generates a fresh QR for a patient with no existing profile', async () => {
      const { service, findOneAndUpdateMock, auditLogs } = createService({
        patients: [makePatient()],
        profiles: [],
      });

      const result = await service.generateQr(
        'patient-uuid-1',
        'org-uuid-1',
        makeUser(),
        'http://localhost:3000',
        ctx,
      );

      expect(result.status).toBe(QrStatus.ACTIVE);
      expect(result.regenerated).toBe(false);
      expect(result.payloadUrl).toMatch(/^http:\/\/localhost:3000\/verify\//);
      expect(result.qrDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(QRCode.toDataURL as jest.Mock).toHaveBeenCalled();

      const updateFilter = findOneAndUpdateMock.mock.calls[0][0];
      expect(updateFilter).toEqual({ patientId: 'patient-uuid-1' });
      const updateDoc = findOneAndUpdateMock.mock.calls[0][1] as {
        $set: Record<string, any>;
      };
      expect(updateDoc.$set.qrStatus).toBe(QrStatus.ACTIVE);
      expect(updateDoc.$set.scanCount).toBe(0);
      expect(updateDoc.$set.qrCodeHash).toBeTruthy();
      expect(updateDoc.$set.qrCodeEnc).toContain(':');

      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEDICAL_CARD_QR_GENERATE' }),
      );
    });

    it('regenerates when an active QR already exists (and resets the scan counter)', async () => {
      const { service, auditLogs } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ scanCount: 8 })],
      });

      const result = await service.generateQr(
        'patient-uuid-1',
        'org-uuid-1',
        makeUser(),
        undefined,
        ctx,
      );

      expect(result.regenerated).toBe(true);
      expect(result.status).toBe(QrStatus.ACTIVE);
      expect(result.payloadUrl).toMatch(/^http:\/\/localhost:3000\/verify\//);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MEDICAL_CARD_QR_REGENERATE',
          metadata: expect.objectContaining({ previousScanCount: 8 }),
        }),
      );
    });

    it('rejects a non-http(s) baseUrl', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [],
      });

      await expect(
        service.generateQr('patient-uuid-1', 'org-uuid-1', makeUser(), 'not-a-url', ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('revokeQr', () => {
    it('throws NotFoundException when no QR profile exists', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [undefined],
      });

      await expect(
        service.revokeQr('patient-uuid-1', 'org-uuid-1', makeUser(), ctx),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when already revoked', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ qrStatus: QrStatus.REVOKED })],
      });

      await expect(
        service.revokeQr('patient-uuid-1', 'org-uuid-1', makeUser(), ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('revokes an active QR and records the audit trail', async () => {
      const { service, auditLogs } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ scanCount: 4 })],
      });

      const result = await service.revokeQr('patient-uuid-1', 'org-uuid-1', makeUser(), ctx);

      expect(result.status).toBe(QrStatus.REVOKED);
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MEDICAL_CARD_QR_REVOKE',
          metadata: expect.objectContaining({ scanCountAtRevoke: 4 }),
        }),
      );
    });
  });

  describe('getQrStatus', () => {
    it('returns NOT_CREATED when no profile exists', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [undefined],
      });

      const result = await service.getQrStatus('patient-uuid-1', 'org-uuid-1', makeUser(), ctx);

      expect(result.status).toBe('NOT_CREATED');
      expect(result.scanCount).toBe(0);
      expect(result.payloadUrl).toBeNull();
    });

    it('returns the ACTIVE status, scan count and dates', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ scanCount: 7 })],
      });

      const result = await service.getQrStatus('patient-uuid-1', 'org-uuid-1', makeUser(), ctx);

      expect(result.status).toBe(QrStatus.ACTIVE);
      expect(result.scanCount).toBe(7);
      expect(result.lastScannedAt).toEqual(new Date('2026-09-01T10:00:00Z'));
      expect(result.qrCreatedAt).toEqual(new Date('2026-09-01T09:00:00Z'));
      expect(result.payloadUrl).toBeNull();
    });
  });

  describe('getQrPng', () => {
    it('renders a PNG for an active QR', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ qrCodeEnc: 'dummy:enc:code' })],
      });
      // decrypt() is private — stub it so payload-url building is deterministic.
      (service as unknown as { decrypt: () => string }).decrypt = jest.fn(() => 'scan-code');

      const result = await service.getQrPng('patient-uuid-1', 'org-uuid-1', makeUser());

      expect(result.mimeType).toBe('image/png');
      expect(result.fileName).toBe('medical-card-qr-MRN-00001.png');
      expect(result.buffer).toEqual(Buffer.from('png-bytes'));
      expect(QRCode.toBuffer as jest.Mock).toHaveBeenCalled();
    });

    it('throws NotFoundException for a revoked QR', async () => {
      const { service } = createService({
        patients: [makePatient()],
        profiles: [makeProfile({ qrStatus: QrStatus.REVOKED })],
      });

      await expect(
        service.getQrPng('patient-uuid-1', 'org-uuid-1', makeUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('verifyScan', () => {
    it('returns INVALID for an unknown code without touching audit', async () => {
      const { service, auditLogs } = createService({ profiles: [] });

      const result = await service.verifyScan('unknown-code', ctx);

      expect(result).toEqual({
        valid: false,
        status: 'INVALID',
        scannedAt: expect.any(Date),
      });
      expect(auditLogs.log).not.toHaveBeenCalled();
    });

    it('returns REVOKED and audits a denied scan', async () => {
      const { service, auditLogs } = createService({
        profiles: [makeProfile({ qrStatus: QrStatus.REVOKED })],
      });

      const result = await service.verifyScan('revoked-code', ctx);

      expect(result.valid).toBe(false);
      expect(result.status).toBe('REVOKED');
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MEDICAL_CARD_QR_SCAN',
          result: 'denied',
        }),
      );
    });

    it('increments the scan counter and returns an initials hint for an active code', async () => {
      const { service, findOneAndUpdateMock, auditLogs } = createService({
        profiles: [makeProfile({ scanCount: 1 })],
        patients: [makePatient()],
      });

      const result = await service.verifyScan('active-code', ctx);

      expect(result.valid).toBe(true);
      expect(result.status).toBe('ACTIVE');
      expect(result.hint).toEqual({ initials: 'JD' });

      expect(findOneAndUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'profile-uuid-1' }),
        expect.objectContaining({ $inc: { scanCount: 1 } }),
      );
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MEDICAL_CARD_QR_SCAN',
          result: 'success',
        }),
      );
    });
  });

  describe('verifyAndGetCard', () => {
    it('throws NotFoundException for an unknown/revoked code', async () => {
      const { service } = createService({ profiles: [undefined] });

      await expect(
        service.verifyAndGetCard('unknown-code', makeUser(), ctx),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids a patient from viewing someone else’s profile', async () => {
      const { service } = createService({
        profiles: [makeProfile()],
        patients: [makePatient()],
      });

      await expect(
        service.verifyAndGetCard(
          'active-code',
          makeUser({ role: UserRole.PATIENT, email: 'stranger@example.com' }),
          ctx,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the card to an authorized viewer of an active code', async () => {
      const { service } = createService({
        // 1) profile by qrCodeHash, 2) profile inside getCard
        profiles: [makeProfile(), makeProfile()],
        // 1) patient by _id, 2) patient inside getCard/loadPatient
        patients: [makePatient(), makePatient()],
      });

      const result = await service.verifyAndGetCard('active-code', makeUser(), ctx);

      expect(result.patientId).toBe('patient-uuid-1');
      expect(result.card.patient.mrn).toBe('MRN-00001');
      expect(result.card.qr.status).toBe(QrStatus.ACTIVE);
    });
  });
});
