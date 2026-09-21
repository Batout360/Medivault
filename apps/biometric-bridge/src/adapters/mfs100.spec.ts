import { MFS100Sdk, MFS100SdkError } from '@medivault/mfs100-sdk';
import { MFS100Adapter, MFS100_VENDOR_ID, MANTRA_VENDOR_ID } from './mfs100';
import { CapturedTemplate } from './adapter.interface';

/**
 * Stub the native SDK so adapter logic can be tested without a physical
 * scanner. The SDK is never fabricated — only the native transport is mocked.
 */
function stubSdk(overrides: Partial<Record<keyof MFS100Sdk, unknown>> = {}): MFS100Sdk {
  const sdk = MFS100Sdk.getInstance();
  const fake = {
    getStatus: () => ({ failureCode: 0, message: '' }),
    initialize: jest.fn(async () => undefined),
    openDevice: jest.fn(async () => undefined),
    closeDevice: jest.fn(async () => undefined),
    isDeviceConnected: () => true,
    getDeviceInfo: () => ({
      serialNumber: 'MFS-TEST-001',
      manufacturerName: 'Mantra Softech',
      productName: 'MFS100',
      softwareVersion: '1.0.0',
    }),
    capture: jest.fn(async () => ({
      rawImage: Buffer.alloc(1024),
      quality: 70,
      nfiq: 1,
      capturedAt: new Date().toISOString(),
    })),
    createTemplate: jest.fn(async () => ({
      template: Buffer.from('MFS_TEMPLATE_BYTES'),
      format: 1,
      quality: 70,
    })),
    matchTemplates: jest.fn(async () => ({ matched: true, score: 100000 })),
    stopCapture: jest.fn(() => undefined),
    shutdown: jest.fn(async () => undefined),
    ...overrides,
  };
  return Object.assign(sdk, fake) as MFS100Sdk;
}

describe('MFS100Adapter (SDK stubbed)', () => {
  let adapter: MFS100Adapter;

  beforeEach(() => {
    stubSdk();
    adapter = new MFS100Adapter();
  });

  afterEach(async () => {
    await adapter.dispose().catch(() => undefined);
  });

  it('exposes the Mantra vendor/product identifiers', () => {
    expect(MFS100_VENDOR_ID).toBe(0x04b4);
    expect(MANTRA_VENDOR_ID).toBe(0x2c0f);
    expect(adapter.canHandle(0x04b4, 0x8613)).toBe(true);
    expect(adapter.canHandle(0x04b4, 0x1005)).toBe(true);
    expect(adapter.canHandle(0x2c0f, 0x1005)).toBe(true);
    expect(adapter.canHandle(0xffff, 0xffff)).toBe(false);
  });

  it('rejects vendor IDs not supported', () => {
    expect(adapter.supportedVendorIds).toContain(0x04b4);
    expect(adapter.supportedVendorIds).toContain(0x2c0f);
  });

  it('reports connected device info after initialize', async () => {
    const info = await adapter.initialize();
    expect(info.connected).toBe(true);
    expect(info.id).toBeTruthy();
  });

  it('returns a template from captureFingerprint', async () => {
    await adapter.initialize();
    const template: CapturedTemplate = await adapter.captureFingerprint();
    expect(template.templatePayload).toBe(Buffer.from('MFS_TEMPLATE_BYTES').toString('base64'));
    expect(template.format).toBe('ISO_19794_2');
    expect(template.quality).toBe(70);
    expect(template.nfiq).toBe(1);
  });

  it('aggregates multiple samples during enrollment', async () => {
    await adapter.initialize();
    const result = await adapter.enroll({ samples: 2 });
    expect(result.success).toBe(true);
    expect(result.samplesCollected).toBe(2);
  });

  it('scores a successful verification', async () => {
    await adapter.initialize();
    const result = await adapter.verify({
      templatePayload: Buffer.from('MFS_TEMPLATE_BYTES').toString('base64'),
      format: 'ISO_19794_2',
    });
    expect(result.matched).toBe(true);
    expect(result.score).toBe(100); // 100000/100000 normalized
  });

  it('identifies the best-scoring candidate', async () => {
    await adapter.initialize();
    const result = await adapter.identify([
      {
        patientId: 'p1',
        templatePayload: 'cGVyc29uLW9uZQ==',
        format: 'ISO_19794_2',
      },
      {
        patientId: 'p2',
        templatePayload: 'cGVyc29uLXR3bw==',
        format: 'ISO_19794_2',
      },
    ]);
    expect(result.matched).toBe(true);
    expect(result.patientId).toBe('p1');
  });

  it('does not match when the SDK reports no match', async () => {
    stubSdk({
      matchTemplates: jest.fn(async () => ({ matched: false, score: 1000 })),
    });
    await adapter.initialize();
    const result = await adapter.verify({
      templatePayload: 'cGVyc29uLW9uZQ==',
      format: 'ISO_19794_2',
    });
    expect(result.matched).toBe(false);
  });
});

describe('MFS100Adapter with missing SDK', () => {
  it('surfaces the SDK failure clearly (never fabricates data)', async () => {
    const sdk = MFS100Sdk.getInstance();
    const spy = jest.spyOn(sdk, 'getStatus').mockReturnValue({
      failureCode: 90003,
      message: 'WRAPPER_DLL_NOT_FOUND',
    } as never);
    try {
      const adapter = new MFS100Adapter();
      await expect(adapter.initialize()).rejects.toThrow(MFS100SdkError);
    } finally {
      spy.mockRestore();
    }
  });
});
