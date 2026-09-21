import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { MFS100Sdk } from '@medivault/mfs100-sdk';
import { BiometricService } from './biometric.service';
import { BiometricSecurityService } from './services/biometric-security.service';
import { MFS100BiometricProvider } from './providers/mfs100-biometric.provider';
import { BiometricTemplateDocument } from './schemas/biometric-template.schema';
import { PatientDocument } from '../patients/schemas/patient.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

function makeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

type AuditMock = { log: jest.Mock } & AuditLogsService;

function makeAuditLogs(): AuditMock {
  return { log: jest.fn(async () => undefined) } as unknown as AuditMock;
}

/**
 * Stub the native MFS100 SDK so the real provider logic can be exercised
 * without the vendor DLL. Only the native transport is stubbed.
 */
function stubSdk(overrides: Partial<Record<keyof MFS100Sdk, unknown>> = {}): void {
  const sdk = MFS100Sdk.getInstance();
  Object.assign(sdk, {
    getStatus: () => ({ failureCode: 0, message: '' }),
    initialize: jest.fn(async () => undefined),
    isDeviceConnected: () => true,
    matchTemplates: jest.fn(async () => ({ matched: true, score: 100000 })),
    ...overrides,
  });
}

class FakeTemplateModel {
  static savedDocs: Array<Record<string, unknown>> = [];
  static find = jest.fn(() => ({
    lean: () => ({
      exec: async () => [],
    }),
  }));
  static findOne = jest.fn(() => ({
    lean: () => ({ exec: async () => null }),
  }));
  static findOneAndUpdate = jest.fn(() => ({ exec: async () => null }));

  save = jest.fn(async function () {
    FakeTemplateModel.savedDocs.push(this.doc);
    return { _id: 'template-1' };
  });

  constructor(public readonly doc: Record<string, unknown>) {}
}

function makeTemplateModel(docs: Array<Record<string, unknown>> = []) {
  FakeTemplateModel.savedDocs = [];
  const model = FakeTemplateModel as unknown as Model<BiometricTemplateDocument>;
  Object.assign(model, {
    find: jest.fn(() => ({
      lean: () => ({
        exec: async () => docs,
      }),
    })),
  });
  return { model };
}

function makePatientModel(patient?: Record<string, unknown>) {
  const findOne = jest.fn(() => ({
    lean: () => ({
      exec: async () => patient ?? null,
    }),
  }));
  const model = {} as Model<PatientDocument>;
  Object.assign(model, { findOne });
  return { model, findOne };
}

const capture = {
  templatePayload: Buffer.from('TEMPLATE_PAYLOAD').toString('base64'),
  format: 'ISO_19794_2',
  quality: 80,
  deviceId: 'MFS-TEST-001',
  capturedAt: new Date().toISOString(),
};

const ctx = { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' };

function buildService(
  overrides: {
    provider?: unknown;
    patient?: Record<string, unknown>;
    config?: ConfigService;
    templateDocs?: Array<Record<string, unknown>>;
  } = {},
) {
  const provider = overrides.provider ?? new MFS100BiometricProvider();
  const templates = makeTemplateModel(overrides.templateDocs ?? []);
  const patients = makePatientModel(overrides.patient);
  const audit = makeAuditLogs();
  const config = overrides.config ?? makeConfig({ BIOMETRIC_ENCRYPTION_KEY: 'x'.repeat(32) });
  const security = new BiometricSecurityService(config, audit);
  const service = new BiometricService(
    provider as never,
    templates.model,
    patients.model,
    audit,
    security,
    config,
  );
  return { service, templates, patients, audit, security };
}

describe('BiometricService', () => {
  beforeEach(() => {
    stubSdk();
  });

  it('rejects enrollment when quality is below threshold', async () => {
    const { service } = buildService({
      patient: { _id: 'p1', organizationId: 'org1', deletedAt: null },
    });
    await expect(
      service.enroll({ ...capture, quality: 10 } as never, 'user1', 'org1' as never, ctx),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects enrollment for a patient outside the organization', async () => {
    const { service } = buildService(); // no patient found
    await expect(service.enroll(capture as never, 'user1', 'org1' as never, ctx)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('stores the encrypted template and audits success', async () => {
    const { service, audit } = buildService({
      patient: { _id: 'p1', organizationId: 'org1', deletedAt: null },
    });

    const result = await service.enroll(capture as never, 'user1', 'org1' as never, ctx);

    expect(result.success).toBe(true);
    expect(FakeTemplateModel.savedDocs).toHaveLength(1);
    const saved = FakeTemplateModel.savedDocs[0];
    // templateData is stored encrypted (base64 iv + ciphertext), never raw
    const stored = saved.templateData as string;
    expect(stored).not.toContain('TEMPLATE_PAYLOAD');
    expect(Buffer.from(stored, 'base64').length).toBeGreaterThan(16);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BIOMETRIC_ENROLL',
        result: 'success',
        action: 'ENROLL_BIOMETRIC',
      }),
    );
  });

  it('rejects identification with low quality', async () => {
    const { service } = buildService();
    await expect(service.identify({ ...capture, quality: 5 } as never, ctx)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('reports no match and audits failure when nothing matches', async () => {
    const { service, audit } = buildService();
    const result = await service.identify(capture as never, ctx);
    expect(result.matched).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BIOMETRIC_VERIFY',
        result: 'failure',
        action: 'IDENTIFY_BIOMETRIC',
      }),
    );
  });

  it('returns the matched patient id on a successful identification', async () => {
    const patient = {
      _id: 'p1',
      organizationId: 'org1',
      isActive: true,
      deletedAt: null,
    };
    // Seed one enrolled gallery template so the real provider finds a match.
    const { service } = buildService({
      provider: new MFS100BiometricProvider(),
      patient,
      templateDocs: [{ _id: 't1', patientId: 'p1', templateData: 'not-a-real-template' }],
    });

    const result = await service.identify(capture as never, ctx);

    expect(result.matched).toBe(true);
    expect(result.patientId).toBe('p1');
  });

  it('audits security failures during verification', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const { service, audit } = buildService({
        patient: { _id: 'p1', organizationId: 'org1', deletedAt: null },
      });
      // Plain (unencrypted) payload is rejected in production.
      await expect(
        service.verify(
          'p1',
          { ...capture, templatePayload: 'PLAIN' } as never,
          'org1' as never,
          ctx,
        ),
      ).rejects.toThrow();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'BIOMETRIC_SECURITY_FAILURE',
          result: 'failure',
        }),
      );
    } finally {
      delete process.env.NODE_ENV;
    }
  });
});
