import { pino } from 'pino';
import { MFS100Sdk } from '@medivault/mfs100-sdk';
import { ScannerRegistry } from './scanner-registry';
import { MFS100Adapter } from './mfs100';

const quietLogger = pino({ level: 'silent' });

/**
 * Stub the native SDK so the real MFS100 adapter can be activated without a
 * physical scanner. Only the native transport is stubbed — the adapter itself
 * is the real production implementation.
 */
function stubSdk(): void {
  const sdk = MFS100Sdk.getInstance();
  Object.assign(sdk, {
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
    shutdown: jest.fn(async () => undefined),
  });
}

describe('ScannerRegistry', () => {
  afterEach(() => {
    delete process.env.BIOMETRIC_ADAPTER;
  });

  it('auto mode throws a clear error when no usable scanner is present', async () => {
    const registry = new ScannerRegistry(quietLogger);
    await expect(registry.initializePreferred()).rejects.toThrow(
      /no supported fingerprint scanner|SDK adapter could not start/i,
    );
    await registry.disposeAll();
  });

  it('honors BIOMETRIC_ADAPTER=mfs100 by activating the real adapter', async () => {
    stubSdk();
    process.env.BIOMETRIC_ADAPTER = 'mfs100';
    const registry = new ScannerRegistry(quietLogger);
    const adapter = await registry.initializePreferred();
    expect(adapter).toBeInstanceOf(MFS100Adapter);
    expect(registry.getActive()).toBe(adapter);
    await registry.disposeAll();
  });

  it('emits adapter-active on activation', async () => {
    stubSdk();
    process.env.BIOMETRIC_ADAPTER = 'mfs100';
    const registry = new ScannerRegistry(quietLogger);
    const active: unknown[] = [];
    registry.on('adapter-active', (a) => active.push(a));
    await registry.initializePreferred();
    expect(active).toHaveLength(1);
    await registry.disposeAll();
  });
});