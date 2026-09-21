/**
 * GenericUSBAdapter — low-level USB transport for fingerprint scanners that
 * expose a bulk/interrupt endpoint.
 *
 * IMPORTANT: modern fingerprint sensors (including the Mantra MFS100) require
 * the vendor SDK to decode the raw sensor stream and extract minutiae. Raw USB
 * transfer alone does NOT produce a usable biometric template. Per Medivault
 * policy this adapter therefore REFUSES to fabricate templates: if no template
 * extractor is configured it raises a clear error rather than emitting fake
 * data. Vendor-specific adapters (see mfs100.ts) provide the real extraction.
 */
import {
  BiometricMatchResult,
  CaptureOptions,
  CapturedTemplate,
  EnrollOptions,
  MatchCandidate,
  ScannerAdapter,
  ScannerDeviceInfo,
} from './adapter.interface';
import { EventEmitter } from 'events';

// Known USB fingerprint scanner vendor IDs (for detection reporting / routing).
export const KNOWN_SCANNER_VENDOR_IDS = new Set([
  0x08c7, // Futronic Technology
  0x0483, // STMicroelectronics (used by many scanner manufacturers)
  0x1fc9, // NXP Semiconductors
  0x09cb, // Crossmatch (HID DigitalPersona)
  0x1a86, // QinHeng Electronics (HL-340 USB-Serial)
  0x0bca, // Fingerprint Cards AB
  0x14d2, // Gemalto (Thales)
  0x04b4, // Cypress — bridge chip of the Mantra MFS100
  0x2c0f, // Mantra Softech — own USB VID (MFS100/MFS500, e.g. 0x2c0f:0x1005)
]);

/** Optional hook that converts a raw USB capture into a template. */
export interface TemplateExtractor {
  id: string;
  canHandle(vendorId: number, productId: number): boolean;
  extract(rawImage: Buffer, meta: { width: number; height: number }): Promise<string>;
}

export class GenericUSBAdapter extends EventEmitter implements ScannerAdapter {
  readonly id = 'generic-usb';
  readonly name = 'Generic USB Fingerprint Scanner';
  readonly supportedVendorIds: number[] = Array.from(KNOWN_SCANNER_VENDOR_IDS);

  private extractor: TemplateExtractor | null = null;
  private device: {
    vendorId: number;
    productId: number;
    serialNumber: string;
  } | null = null;
  private ready = false;

  constructor(extractor?: TemplateExtractor) {
    super();
    this.extractor = extractor ?? null;
  }

  /** Register a vendor template extractor for this transport. */
  setExtractor(extractor: TemplateExtractor): void {
    this.extractor = extractor;
  }

  canHandle(vendorId: number, _productId: number): boolean {
    return KNOWN_SCANNER_VENDOR_IDS.has(vendorId);
  }

  async initialize(deviceInfo?: {
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
  }): Promise<ScannerDeviceInfo> {
    if (!deviceInfo) throw new Error('GenericUSBAdapter requires detected USB device info');
    this.device = {
      vendorId: deviceInfo.vendorId ?? 0,
      productId: deviceInfo.productId ?? 0,
      serialNumber:
        deviceInfo.serialNumber ??
        `USB_${(deviceInfo.vendorId ?? 0).toString(16)}_${(deviceInfo.productId ?? 0).toString(16)}`,
    };

    if (this.extractor && this.extractor.canHandle(this.device.vendorId, this.device.productId)) {
      this.ready = true;
    } else {
      // No vendor SDK extractor available — device is detectable but NOT usable.
      this.ready = false;
    }

    return {
      id: this.device.serialNumber,
      name: this.name,
      manufacturer: `USB 0x${this.device.vendorId.toString(16).padStart(4, '0')}`,
      model: `0x${this.device.productId.toString(16).padStart(4, '0')}`,
      firmwareVersion: null,
      connectionType: 'usb',
      connected: this.ready,
      supportedFormats: this.extractor ? ['VENDOR_TEMPLATE'] : [],
    };
  }

  async getDeviceInfo(): Promise<ScannerDeviceInfo> {
    if (!this.device) throw new Error('Device not initialized');
    return {
      id: this.device.serialNumber,
      name: this.name,
      manufacturer: `USB 0x${this.device.vendorId.toString(16).padStart(4, '0')}`,
      model: `0x${this.device.productId.toString(16).padStart(4, '0')}`,
      firmwareVersion: null,
      connectionType: 'usb',
      connected: this.ready,
      supportedFormats: this.extractor ? ['VENDOR_TEMPLATE'] : [],
    };
  }

  async isConnected(): Promise<boolean> {
    return this.ready;
  }

  async startCapture(): Promise<void> {
    if (this.ready) {
      this.emit('capturing', { kind: 'capturing' });
    } else {
      throw new Error(
        'No vendor SDK template extractor configured for this USB scanner. ' +
          'Install the hardware vendor SDK and register a matching adapter.',
      );
    }
  }

  async stopCapture(): Promise<void> {
    // no-op for the base transport
  }

  async captureFingerprint(options?: CaptureOptions): Promise<CapturedTemplate> {
    void options;
    throw new Error(
      'This USB scanner requires its vendor SDK to produce a fingerprint template. ' +
        'The generic-usb adapter does not simulate biometric data. ' +
        'Install the vendor SDK and use the matching adapter (e.g. mfs100).',
    );
  }

  async enroll(): Promise<{
    success: boolean;
    samplesCollected: number;
    samplesRequired: number;
    quality: number;
    message?: string;
  }> {
    return {
      success: false,
      samplesCollected: 0,
      samplesRequired: 3,
      quality: 0,
      message:
        'Vendor SDK template extractor required — enrollment is not available on generic-usb.',
    };
  }

  async verify(
    _referenceTemplate: { templatePayload: string; format: string } | null,
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    void options;
    throw new Error(
      'Vendor SDK template extractor required — verification is not available on generic-usb.',
    );
  }

  async identify(
    _candidates: MatchCandidate[],
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    void options;
    throw new Error(
      'Vendor SDK template extractor required — identification is not available on generic-usb.',
    );
  }

  async dispose(): Promise<void> {
    this.ready = false;
    this.device = null;
  }
}
