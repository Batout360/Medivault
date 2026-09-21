import { ServiceUnavailableException } from '@nestjs/common';
import { MFS100Sdk } from '@medivault/mfs100-sdk';
import { MFS100BiometricProvider } from './mfs100-biometric.provider';

const PROBE = Buffer.from('PROBE_TEMPLATE').toString('base64');
const GALLERY_A = {
  templateId: 'a',
  patientId: 'p1',
  templatePayload: 'GALLERY_A',
  format: 'ISO_19794_2',
  quality: 0,
};

function stubMatch(impl: (a: Buffer, b: Buffer) => Promise<{ matched: boolean; score: number }>) {
  const sdk = MFS100Sdk.getInstance();
  Object.assign(sdk, {
    getStatus: () => ({ failureCode: 0, message: '' }),
    initialize: jest.fn(async () => undefined),
    isDeviceConnected: () => true,
    matchTemplates: impl,
  });
  return sdk;
}

describe('MFS100BiometricProvider (SDK stubbed)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects enrollment when template payload is missing', async () => {
    const provider = new MFS100BiometricProvider();
    const result = await provider.enroll('p1', {
      templatePayload: '',
      format: 'ISO_19794_2',
      quality: 80,
      deviceId: 'd1',
      capturedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid base64 template', async () => {
    stubMatch(async () => ({ matched: true, score: 100000 }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.enroll('p1', {
      templatePayload: Buffer.alloc(64).toString('base64'),
      format: 'ISO_19794_2',
      quality: 80,
      deviceId: 'd1',
      capturedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    expect(result.quality).toBe(80);
  });

  it('identifies the best-scoring candidate above threshold', async () => {
    stubMatch(async (a: Buffer, b: Buffer) => ({
      matched: true,
      score: b.toString() === 'GALLERY_A' ? 20000 : 15000,
    }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.identify(
      {
        templatePayload: PROBE,
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'd1',
        capturedAt: new Date().toISOString(),
      },
      [
        GALLERY_A,
        {
          templateId: 'b',
          patientId: 'p2',
          templatePayload: 'GALLERY_B',
          format: 'ISO_19794_2',
          quality: 0,
        },
      ],
    );
    expect(result.matched).toBe(true);
    expect(result.patientId).toBe('p1');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns no match when the SDK reports a low score', async () => {
    stubMatch(async () => ({ matched: false, score: 5000 }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.identify(
      {
        templatePayload: PROBE,
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'd1',
        capturedAt: new Date().toISOString(),
      },
      [GALLERY_A],
    );
    expect(result.matched).toBe(false);
  });

  it('returns no match on an empty gallery', async () => {
    stubMatch(async () => ({ matched: true, score: 100000 }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.identify(
      {
        templatePayload: PROBE,
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'd1',
        capturedAt: new Date().toISOString(),
      },
      [],
    );
    expect(result.matched).toBe(false);
  });

  it('verifies a patient when their template matches', async () => {
    stubMatch(async () => ({ matched: true, score: 25000 }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.verify(
      'p1',
      {
        templatePayload: PROBE,
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'd1',
        capturedAt: new Date().toISOString(),
      },
      [
        GALLERY_A,
        {
          templateId: 'z',
          patientId: 'other',
          templatePayload: 'Z',
          format: 'ISO_19794_2',
          quality: 0,
        },
      ],
    );
    expect(result.matched).toBe(true);
    expect(result.patientId).toBe('p1');
  });

  it('does not verify against other patients templates', async () => {
    stubMatch(async () => ({ matched: false, score: 0 }));
    const provider = new MFS100BiometricProvider();
    const result = await provider.verify(
      'p1',
      {
        templatePayload: PROBE,
        format: 'ISO_19794_2',
        quality: 80,
        deviceId: 'd1',
        capturedAt: new Date().toISOString(),
      },
      [
        {
          templateId: 'z',
          patientId: 'other',
          templatePayload: 'Z',
          format: 'ISO_19794_2',
          quality: 0,
        },
      ],
    );
    expect(result.matched).toBe(false);
  });

  it('health check reports failure when the SDK is unavailable', async () => {
    const sdk = MFS100Sdk.getInstance();
    const spy = jest.spyOn(sdk, 'getStatus').mockReturnValue({
      failureCode: 90003,
      message: 'WRAPPER_DLL_NOT_FOUND',
    } as never);
    try {
      const provider = new MFS100BiometricProvider();
      expect(await provider.healthCheck()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('matching throws a service-unavailable error when the SDK is missing', async () => {
    const sdk = MFS100Sdk.getInstance();
    const spy = jest.spyOn(sdk, 'getStatus').mockReturnValue({
      failureCode: 90003,
      message: 'WRAPPER_DLL_NOT_FOUND',
    } as never);
    try {
      const provider = new MFS100BiometricProvider();
      await expect(
        provider.identify(
          {
            templatePayload: PROBE,
            format: 'ISO_19794_2',
            quality: 80,
            deviceId: 'd1',
            capturedAt: new Date().toISOString(),
          },
          [GALLERY_A],
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('MFS100BiometricProvider threshold', () => {
  it('enforces the SDK default threshold when unset', () => {
    delete process.env.MFS100_MATCH_THRESHOLD;
    const provider = new MFS100BiometricProvider() as unknown as {
      matchThreshold: number;
    };
    expect(provider.matchThreshold).toBeGreaterThan(0);
  });
});
