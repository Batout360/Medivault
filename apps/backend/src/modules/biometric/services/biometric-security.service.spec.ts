import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptPayload, signBridgePayload } from '@medivault/mfs100-sdk';
import { BiometricSecurityService } from './biometric-security.service';
import { BiometricCaptureData } from '../providers/biometric-provider.interface';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

const ENCRYPTION_KEY = 'test-bridge-encryption-key-0123456789-32c';
const BRIDGE_SECRET = 'test-bridge-secret';
const DEVICE_ID = 'MFS-TEST-001';

function makeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

type AuditMock = { log: jest.Mock } & AuditLogsService;

function makeAuditLogs(): AuditMock {
  return { log: jest.fn(async () => undefined) } as unknown as AuditMock;
}

function secureCapture(overrides: Partial<BiometricCaptureData> = {}): BiometricCaptureData {
  const raw = Buffer.from('FAKE_MINUTIAE_TEMPLATE').toString('base64');
  const opaque = encryptPayload(raw, ENCRYPTION_KEY);
  const capturedAt = new Date().toISOString();
  return {
    templatePayload: opaque,
    format: 'ISO_19794_2',
    quality: 80,
    deviceId: DEVICE_ID,
    capturedAt,
    bridgeSignature: signBridgePayload(
      {
        opaquePayload: opaque,
        format: 'ISO_19794_2',
        deviceId: DEVICE_ID,
        capturedAt,
      },
      BRIDGE_SECRET,
    ),
    ...overrides,
  };
}

describe('BiometricSecurityService', () => {
  let previousNodeEnv: string | undefined;

  beforeAll(() => {
    previousNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('decrypts an authenticated, fresh capture from the bridge', async () => {
    const audit = makeAuditLogs();
    const service = new BiometricSecurityService(
      makeConfig({
        BIOMETRIC_ENCRYPTION_KEY: ENCRYPTION_KEY,
        BIOMETRIC_BRIDGE_SECRET: BRIDGE_SECRET,
      }),
      audit,
    );

    const verified = await service.verifyAndDecrypt(secureCapture(), {
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });

    expect(verified.templatePayload).toBe(Buffer.from('FAKE_MINUTIAE_TEMPLATE').toString('base64'));
    expect(verified.fromBridge).toBe(true);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rejects a capture with an invalid bridge signature', async () => {
    const audit = makeAuditLogs();
    const service = new BiometricSecurityService(
      makeConfig({
        BIOMETRIC_ENCRYPTION_KEY: ENCRYPTION_KEY,
        BIOMETRIC_BRIDGE_SECRET: BRIDGE_SECRET,
      }),
      audit,
    );

    const capture = secureCapture();
    capture.bridgeSignature = 'deadbeef';

    await expect(
      service.verifyAndDecrypt(capture, {
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BIOMETRIC_SECURITY_FAILURE',
        result: 'failure',
      }),
    );
  });

  it('rejects a stale (replayed) capture', async () => {
    const audit = makeAuditLogs();
    const service = new BiometricSecurityService(
      makeConfig({
        BIOMETRIC_ENCRYPTION_KEY: ENCRYPTION_KEY,
        BIOMETRIC_BRIDGE_SECRET: BRIDGE_SECRET,
      }),
      audit,
    );

    await expect(
      service.verifyAndDecrypt(
        secureCapture({
          capturedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        }),
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a device outside the allowed list', async () => {
    const audit = makeAuditLogs();
    const service = new BiometricSecurityService(
      makeConfig({
        BIOMETRIC_ENCRYPTION_KEY: ENCRYPTION_KEY,
        BIOMETRIC_BRIDGE_SECRET: BRIDGE_SECRET,
        BIOMETRIC_ALLOWED_DEVICES: 'OTHER-DEVICE',
      }),
      audit,
    );

    await expect(
      service.verifyAndDecrypt(secureCapture(), {
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows plain (unencrypted) payloads only outside production', async () => {
    process.env.NODE_ENV = 'development';
    const service = new BiometricSecurityService(makeConfig(), makeAuditLogs());

    const verified = await service.verifyAndDecrypt(
      {
        templatePayload: 'PLAIN_DEV_PAYLOAD',
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'DEV_SCANNER',
        capturedAt: new Date().toISOString(),
      },
      { ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(verified.fromBridge).toBe(false);
    expect(verified.templatePayload).toBe('PLAIN_DEV_PAYLOAD');
  });

  it('rejects plain payloads in production', async () => {
    process.env.NODE_ENV = 'production';
    const audit = makeAuditLogs();
    const service = new BiometricSecurityService(makeConfig(), audit);

    await expect(
      service.verifyAndDecrypt(
        {
          templatePayload: 'PLAIN_PAYLOAD',
          format: 'ISO_19794_2',
          quality: 80,
          deviceId: 'DEV_SCANNER',
          capturedAt: new Date().toISOString(),
        },
        { ipAddress: '127.0.0.1', userAgent: 'test' },
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'failure' }));
  });
});
