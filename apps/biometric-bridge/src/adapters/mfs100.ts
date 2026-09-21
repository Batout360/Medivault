/**
 * MFS100Adapter — real Mantra Softech MFS100 USB fingerprint scanner.
 *
 * Communicates with the scanner through the vendor MFS100.dll native SDK via
 * the shared @medivault/mfs100-sdk FFI wrapper (koffi). This is NOT a raw USB
 * capture: template extraction and matching use the manufacturer SDK exactly
 * as required by the hardware vendor.
 *
 * USBs:
 *   vendor 0x04B4 (Cypress bridge chip), product 0x8613 (MFS100 default)
 *   vendor 0x2C0F (Mantra Softech USB VID),  product 0x1005 (Mantra VID/PID)
 * Both pairings are published in the Mantra SDK samples; some MFS100 units
 * enumerate as Cypress 0x04B4:0x8613 and others as Mantra 0x2C0F:0x1005.
 *
 * If the SDK/driver is missing the adapter reports a clear, actionable error.
 * It NEVER fabricates fingerprint data.
 */
import {
  MFS100Sdk,
  MFS100SdkError,
  MFS100TemplateFormat,
  MFS100_FORMAT_LABELS,
} from '@medivault/mfs100-sdk';
import { randomUUID } from 'crypto';
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

export const MFS100_VENDOR_ID = 0x04b4;
export const MANTRA_VENDOR_ID = 0x2c0f;
export const MFS100_PRODUCT_IDS = [0x8613, 0x1005];

/** Normalise a raw SDK match score (0–100000) to a 0–100 percentage. */
function normalizeScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round((score / 100000) * 1000) / 10));
}

export class MFS100Adapter extends EventEmitter implements ScannerAdapter {
  readonly id = 'mfs100';
  readonly name = 'Mantra MFS100 Fingerprint Scanner';
  private readonly vendorPidOverride: number[];

  private sdk: MFS100Sdk;
  private device: ScannerDeviceInfo | null = null;
  private busy = false;

  constructor() {
    super();
    this.sdk = MFS100Sdk.getInstance();
    this.vendorPidOverride = (process.env.MFS100_PRODUCT_ID ?? '')
      .split(',')
      .map((p) => parseInt(p.trim(), 16))
      .filter((n) => !Number.isNaN(n));
  }

  get supportedVendorIds(): number[] {
    const override = (process.env.MFS100_VENDOR_ID ?? '')
      .split(',')
      .map((v) => parseInt(v.trim(), 16))
      .filter((n) => !Number.isNaN(n));
    return override.length
      ? override
      : [MFS100_VENDOR_ID, MANTRA_VENDOR_ID];
  }

  canHandle(vendorId: number, productId: number): boolean {
    const knownPids = this.vendorPidOverride.length ? this.vendorPidOverride : MFS100_PRODUCT_IDS;
    return this.supportedVendorIds.includes(vendorId) && knownPids.includes(productId);
  }

  async initialize(): Promise<ScannerDeviceInfo> {
    const status = this.sdk.getStatus();
    if (status.failureCode) {
      const hint = status.dllAvailable
        ? 'Confirm MFS100_SDK_DLL/MFS100_LICENSE_KEY config.'
        : 'MFS100.dll not found — install the Mantra MFS100 driver/SDK and point MFS100_SDK_DLL at it.';
      throw new MFS100SdkError(status.failureCode, `MFS100 SDK error ${status.failureCode}: ${hint}`);
    }

    await this.sdk.initialize();
    try {
      await this.sdk.openDevice();
    } catch (err) {
      if (err instanceof MFS100SdkError && err.code === -1001) {
        throw err;
      }
    }

    this.device = await this.buildDeviceInfo();
    this.emit('connected', { kind: 'connected', model: this.device.model });
    return this.device;
  }

  private async buildDeviceInfo(): Promise<ScannerDeviceInfo> {
    try {
      const info = await this.sdk.getDeviceInfo();
      return {
        id: info.serialNumber || `MFS100_${randomUUID().slice(0, 8).toUpperCase()}`,
        name: this.name,
        manufacturer: info.manufacturerName || 'Mantra Softech',
        model: info.productName || 'MFS100',
        firmwareVersion: info.softwareVersion || null,
        connectionType: 'usb',
        connected: this.sdk.isDeviceConnected(),
        supportedFormats: ['ISO_19794_2', 'ANSI_378', 'ISO_19794_2_2007'],
      };
    } catch {
      return {
        id: `MFS100_${randomUUID().slice(0, 8).toUpperCase()}`,
        name: this.name,
        manufacturer: 'Mantra Softech',
        model: 'MFS100',
        firmwareVersion: null,
        connectionType: 'usb',
        connected: false,
        supportedFormats: ['ISO_19794_2', 'ANSI_378'],
      };
    }
  }

  async getDeviceInfo(): Promise<ScannerDeviceInfo> {
    this.device = await this.buildDeviceInfo();
    return this.device;
  }

  async isConnected(): Promise<boolean> {
    try {
      const connected = this.sdk.isDeviceConnected();
      if (!connected) this.emit('disconnected', { kind: 'disconnected' });
      return connected;
    } catch {
      return false;
    }
  }

  async startCapture(options?: CaptureOptions): Promise<void> {
    if (this.busy) throw new Error('Scanner is busy');
    this.emit('capturing', { kind: 'capturing' });
    // Interactive background capture; captureFingerprint owns the busy flag.
    void this.captureFingerprint(options);
  }

  async stopCapture(): Promise<void> {
    this.sdk.stopCapture();
    this.busy = false;
    this.emit('finger_removed', { kind: 'finger_removed' });
  }

  async captureFingerprint(options?: CaptureOptions): Promise<CapturedTemplate> {
    if (this.busy && options?.timeoutMs === undefined) {
      // A background interactive capture is already running; don't double-start
      throw new Error('Scanner is busy');
    }
    this.busy = true;
    this.emit('finger_detected', { kind: 'finger_detected' });

    try {
      const timeoutMs = options?.timeoutMs ?? 12000;
      const quality = options?.quality ?? 40;

      const cap = await this.sdk.capture(timeoutMs, quality);
      if (cap.quality > 0 && cap.quality < quality) {
        this.emit('poor_quality', {
          kind: 'poor_quality',
          quality: cap.quality,
        });
      }
      this.emit('captured', { kind: 'captured', quality: cap.quality });

      const templ = await this.sdk.createTemplate(
        cap.rawImage,
        quality,
        MFS100TemplateFormat.ISO19794_2,
      );

      const device = await this.getDeviceInfo();
      const templatePayload = templ.template.toString('base64');

      // raw fingerprint image is gone — drop the buffer
      cap.rawImage.fill(0);

      return {
        templatePayload,
        format: MFS100_FORMAT_LABELS[templ.format] ?? 'ISO_19794_2',
        quality: templ.quality,
        nfiq: cap.nfiq ?? undefined,
        deviceId: device.id,
        capturedAt: cap.capturedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MFS100 capture failed';
      this.emit('capture_failed', { kind: 'capture_failed', error: message });
      throw err;
    } finally {
      this.busy = false;
    }
  }

  async enroll(options?: EnrollOptions): Promise<{
    success: boolean;
    samplesCollected: number;
    samplesRequired: number;
    quality: number;
    templatePayload?: string;
    format?: string;
    deviceId?: string;
    message?: string;
  }> {
    const samplesRequired = options?.samples ?? 3;
    const timeoutMs = options?.timeoutMs ?? 12000;
    const minQuality = options?.quality ?? 40;

    const samples: CapturedTemplate[] = [];
    for (let i = 0; i < samplesRequired; i++) {
      this.emit('enrollment_sample', {
        kind: 'enrollment_sample',
        sample: i + 1,
        of: samplesRequired,
        quality: 0,
      });
      const sample = await this.captureFingerprint({
        timeoutMs,
        quality: minQuality,
      });
      if (sample.quality < minQuality) {
        throw new Error(
          `Sample ${i + 1} quality ${sample.quality}% is below the minimum ${minQuality}%. Please rescan.`,
        );
      }
      samples.push(sample);
      this.emit('enrollment_sample', {
        kind: 'enrollment_sample',
        sample: i + 1,
        of: samplesRequired,
        quality: sample.quality,
      });
    }

    // Keep the highest-quality sample as the enrolled template.
    const best = samples.reduce((a, b) => (b.quality > a.quality ? b : a));
    this.emit('enrollment_complete', {
      kind: 'enrollment_complete',
      quality: best.quality,
    });

    return {
      success: true,
      samplesCollected: samples.length,
      samplesRequired,
      quality: best.quality,
      templatePayload: best.templatePayload,
      format: best.format,
      deviceId: best.deviceId,
      message: `Enrolled ${samples.length} sample(s).`,
    };
  }

  async verify(
    referenceTemplate: { templatePayload: string; format: string } | null,
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    if (!referenceTemplate) {
      return { matched: false, captured };
    }

    try {
      const probe = Buffer.from(captured.templatePayload, 'base64');
      const reference = Buffer.from(referenceTemplate.templatePayload, 'base64');
      const { matched, score } = await this.sdk.matchTemplates(probe, reference);
      this.emit(matched ? 'match_found' : 'no_match', {
        kind: matched ? 'match_found' : 'no_match',
        score,
      } as never);
      return { matched, score: normalizeScore(score) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MFS100 verification failed';
      return { matched: false, score: 0, captured };
    }
  }

  async identify(
    candidates: MatchCandidate[],
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    if (!candidates.length) {
      return { matched: false, captured };
    }

    const probe = Buffer.from(captured.templatePayload, 'base64');
    let best: { patientId: string; score: number; templateId: string } | null = null;

    for (const candidate of candidates) {
      try {
        const gallery = Buffer.from(candidate.templatePayload, 'base64');
        const { matched, score } = await this.sdk.matchTemplates(probe, gallery);
        if (matched && (!best || score > best.score)) {
          best = {
            patientId: candidate.patientId,
            score,
            templateId: candidate.patientId,
          };
        }
      } catch {
        // skip malformed candidate templates
      }
    }

    if (best) {
      this.emit('match_found', {
        kind: 'match_found',
        score: best.score,
      } as never);
      return {
        matched: true,
        score: normalizeScore(best.score),
        patientId: best.patientId,
      };
    }

    this.emit('no_match', { kind: 'no_match' });
    return { matched: false, score: 0, captured };
  }

  async dispose(): Promise<void> {
    this.busy = false;
    await this.sdk.shutdown().catch(() => undefined);
    this.device = null;
  }
}
