/**
 * Scanner Registry — manages available adapters and device detection.
 *
 * On startup, scans the USB bus for connected fingerprint scanners and routes
 * each device to the best-matching adapter. Enable/override selection with the
 * BIOMETRIC_ADAPTER environment variable:
 *
 *   auto         (default) prefer MSO 1300 > MFS100 > generic-usb
 *   mso1300      force the Idemia MSO 1300 E3 adapter (production)
 *   mfs100       force the Mantra MFS100 adapter (legacy)
 *   generic-usb  force the raw USB transport (requires a vendor extractor)
 */
import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { ScannerAdapter } from './adapter.interface';
import { GenericUSBAdapter } from './generic-usb';
import { MFS100Adapter } from './mfs100';
import { MSO1300Adapter } from './mso1300';

export interface DetectedDevice {
  vendorId: number;
  productId: number;
  serialNumber: string;
  deviceName: string;
  adapterId: string;
}

export type BiometricAdapterMode = 'auto' | 'mso1300' | 'mfs100' | 'generic-usb';

export class ScannerRegistry extends EventEmitter {
  private readonly adapters: ScannerAdapter[] = [];
  private activeAdapter: ScannerAdapter | null = null;
  private readonly log: Logger;
  private readonly mode: BiometricAdapterMode;

  /** Human-readable reason the active adapter could not be started. */
  lastInitError: string | null = null;

  constructor(log: Logger) {
    super();
    this.log = log;

    const requested = (process.env.BIOMETRIC_ADAPTER ?? 'auto').trim().toLowerCase();
    this.mode = (['auto', 'mso1300', 'mfs100', 'generic-usb'] as const).includes(
      requested as BiometricAdapterMode,
    )
      ? (requested as BiometricAdapterMode)
      : 'auto';

    // Registration order = detection priority: MSO 1300 first, then MFS100, then generic.
    this.adapters.push(new MSO1300Adapter());
    this.adapters.push(new MFS100Adapter());
    this.adapters.push(new GenericUSBAdapter());
  }

  /**
   * Scan USB bus for connected fingerprint scanners.
   * Returns all detected devices with their matched adapters.
   */
  async detect(): Promise<DetectedDevice[]> {
    const detected: DetectedDevice[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const usb = require('usb') as typeof import('usb');
      const devices = usb.getDeviceList();

      for (const device of devices) {
        const { idVendor, idProduct } = device.deviceDescriptor;
        // idVendor/idProduct may be undefined on some libusb builds — guard both
        if (!idVendor || idVendor === 0) continue;

        for (const adapter of this.adapters) {
          if (adapter.canHandle(idVendor, idProduct)) {
            const serial = this.getDeviceSerial(device);
            detected.push({
              vendorId: idVendor,
              productId: idProduct,
              serialNumber: serial,
              deviceName: `USB Device ${idVendor.toString(16).padStart(4, '0')}:${idProduct
                .toString(16)
                .padStart(4, '0')}`,
              adapterId: adapter.id,
            });
            this.log.info(
              { vendorId: idVendor, productId: idProduct, adapter: adapter.id },
              'Detected fingerprint scanner',
            );
            break;
          }
        }
      }
    } catch (err) {
      this.log.warn({ err }, 'USB detection unavailable');
    }

    return detected;
  }

  /**
   * Initialize the active adapter.
   * - forced mode: exactly the requested adapter
   * - auto mode:   prefer MSO 1300, then MFS100, then generic-usb
   */
  async initializePreferred(): Promise<ScannerAdapter> {
    if (this.activeAdapter) return this.activeAdapter;

    if (this.mode === 'generic-usb') {
      return this.activate(new GenericUSBAdapter());
    }
    if (this.mode === 'mso1300') {
      return this.activate(new MSO1300Adapter());
    }
    if (this.mode === 'mfs100') {
      return this.activate(new MFS100Adapter());
    }

    // auto mode — try MSO 1300 first, then MFS100, then generic-usb
    const detected = await this.detect();

    const mso1300Device = detected.find((d) => d.adapterId === 'mso1300');
    if (mso1300Device) {
      const mso = new MSO1300Adapter();
      try {
        return await this.activateWithDevice(mso, mso1300Device);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.lastInitError = reason;
        this.log.warn(
          { err, device: mso1300Device.deviceName },
          'MSO 1300 adapter initialization failed',
        );
      }
    }

    const mfs100Device = detected.find((d) => d.adapterId === 'mfs100');
    if (mfs100Device) {
      const mfs100 = new MFS100Adapter();
      try {
        return await this.activateWithDevice(mfs100, mfs100Device);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.lastInitError = reason;
        this.log.warn(
          { err, device: mfs100Device.deviceName },
          'MFS100 adapter initialization failed',
        );
      }
    }

    const genericDevice = detected.find((d) => d.adapterId === 'generic-usb');
    if (genericDevice) {
      const generic = new GenericUSBAdapter();
      try {
        return await this.activateWithDevice(generic, genericDevice);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.lastInitError = reason;
        this.log.warn(
          { err, device: genericDevice.deviceName },
          'GenericUSB adapter initialization failed',
        );
      }
    }

    if (mso1300Device) {
      throw new Error(
        'Scanner detected but MSO 1300 adapter could not start: ' + this.lastInitError,
      );
    }
    throw new Error('No supported fingerprint scanner detected.');
  }

  private async activate(adapter: ScannerAdapter): Promise<ScannerAdapter> {
    await adapter.initialize();
    this.activeAdapter = adapter;
    this.log.info({ adapterId: adapter.id, name: adapter.name }, 'Activated scanner adapter');
    this.emit('adapter-active', adapter);
    return adapter;
  }

  private async activateWithDevice(
    adapter: ScannerAdapter,
    device: DetectedDevice,
  ): Promise<ScannerAdapter> {
    await adapter.initialize({
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber,
    });
    this.activeAdapter = adapter;
    this.log.info(
      { adapterId: adapter.id, device: device.deviceName },
      'Activated scanner adapter',
    );
    this.emit('adapter-active', adapter);
    return adapter;
  }

  /** Get the currently active adapter (may be null before initializePreferred). */
  getActive(): ScannerAdapter | null {
    return this.activeAdapter;
  }

  /** Re-activate (used after a USB event / disconnect). */
  async reinitialize(): Promise<ScannerAdapter> {
    if (this.activeAdapter) {
      await this.activeAdapter.dispose().catch(() => undefined);
      this.activeAdapter = null;
    }
    return this.initializePreferred();
  }

  /** Dispose all adapters and release devices. */
  async disposeAll(): Promise<void> {
    if (this.activeAdapter) {
      await this.activeAdapter.dispose().catch(() => undefined);
      this.activeAdapter = null;
    }
  }

  private getDeviceSerial(device: any): string {
    try {
      device.open();
      const serial = device.deviceDescriptor.iSerialNumber;
      device.close();
      return `USB_${serial || 'unknown'}`;
    } catch {
      return `USB_${device.deviceDescriptor.idVendor?.toString(16) ?? '0'}_${
        device.deviceDescriptor.idProduct?.toString(16) ?? '0'
      }`;
    }
  }
}
