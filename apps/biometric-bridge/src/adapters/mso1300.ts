/**
 * MSO1300Adapter — Idemia MSO 1300 E3 USB fingerprint scanner.
 *
 * Communicates with the scanner through the vendor MorphoSmartCST.dll C API
 * via the @medivault/mso-sdk FFI wrapper (koffi). This is NOT a raw USB
 * capture: template extraction and matching use the manufacturer SDK exactly
 * as required by the hardware vendor.
 *
 * USB identifiers:
 *   vendor  0x1DCF (Idemia / Morpho)
 *   product 0x0007 (MSO 1300 series)   — most common
 *   product 0x0004 (MSO 1300 E1/E2)    — legacy units
 *
 * The E3 variant includes an FBI-certified PAD (Presentation Attack Detection)
 * liveness sensor. If liveness fails the SDK returns E_LIVENESS_FAILED.
 *
 * If the SDK/driver is missing the adapter reports a clear, actionable error.
 * It NEVER fabricates fingerprint data.
 */
import {
  MSOSdk,
  MSOSdkError,
  MSOTemplateFormat,
  MSO_FORMAT_LABELS,
} from '@medivault/mso-sdk';
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

// ─── USB identifiers ──────────────────────────────────────────────────────────
/** Idemia / Morpho USB vendor ID. */
export const IDEMIA_VENDOR_ID = 0x1dcf;
/** MSO 1300 series default product IDs. */
export const MSO1300_PRODUCT_IDS = [0x0007, 0x0004];

/** Normalise a raw SDK match score (0–100000) to a 0–100 percentage. */
function normalizeScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round((score / 100000) * 1000) / 10));
}

export class MSO1300Adapter extends EventEmitter implements ScannerAdapter {
  readonly id = 'mso1300';
  readonly name = 'Idemia MSO 1300 E3 Fingerprint Scanner';

  private readonly sdk: MSOSdk;
  private device: ScannerDeviceInfo | null = null;
  private busy = false;

  /** Allow PID override via environment variable (comma-separated hex). */
  private get knownPids(): number[] {
    const override = (process.env.MSO_PRODUCT_ID ?? '')
      .split(',')
      .map((p) => parseInt(p.trim(), 16))
      .filter((n) => !Number.isNaN(n));
    return override.length ? override : MSO1300_PRODUCT_IDS;
  }

  get supportedVendorIds(): number[] {
    const override = (process.env.MSO_VENDOR_ID ?? '')
      .split(',')
      .map((v) => parseInt(v.trim(), 16))
      .filter((n) => !Number.isNaN(n));
    return override.length ? override : [IDEMIA_VENDOR_ID];
  }

  constructor() {
    super();
    this.sdk = MSOSdk.getInstance();
  }

  canHandle(vendorId: number, productId: number): boolean {
    return (
      this.supportedVendorIds.includes(vendorId) && this.knownPids.includes(productId)
    );
  }

  async initialize(deviceInfo?: {
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
  }): Promise<ScannerDeviceInfo> {
    const status = this.sdk.getStatus();
    if (status.failureCode) {
      const hint = status.dllAvailable
        ? 'Confirm MSO_SDK_DLL / MSO_LICENSE_KEY config.'
        : 'MorphoSmartCST.dll not found — install the Idemia MSO SDK and point MSO_SDK_DLL at it.';
      throw new MSOSdkError(
        status.failureCode,
        `MSO SDK error ${status.failureCode}: ${hint}`,
      );
    }

    await this.sdk.initialize();
    try {
      await this.sdk.openDevice();
    } catch (err) {
      if (err instanceof MSOSdkError && err.code === -3 /* E_NO_DEVICE */) {
        throw err;
      }
      // Device not yet ready — non-fatal at init time.
    }

    this.device = await this.buildDeviceInfo(deviceInfo?.serialNumber);
    this.emit('connected', { kind: 'connected', model: this.device.model });
    return this.device;
  }

  private async buildDeviceInfo(serialHint?: string): Promise<ScannerDeviceInfo> {
    try {
      const info = await this.sdk.getDeviceInfo();
      return {
        id:
          info.serialNumber ||
          serialHint ||
          `MSO1300_${randomUUID().slice(0, 8).toUpperCase()}`,
        name: this.name,
        manufacturer: info.manufacturerName || 'Idemia',
        model: info.productName || 'MSO 1300 E3',
        firmwareVersion: info.firmwareVersion || null,
        connectionType: 'usb',
        connected: this.sdk.isDeviceConnected(),
        supportedFormats: ['ISO_19794_2', 'ANSI_378', 'ISO_19794_2_2011'],
      };
    } catch {
      return {
        id:
          serialHint || `MSO1300_${randomUUID().slice(0, 8).toUpperCase()}`,
        name: this.name,
        manufacturer: 'Idemia',
        model: 'MSO 1300 E3',
        firmwareVersion: null,
        connectionType: 'usb',
        connected: false,
        supportedFormats: ['ISO_19794_2', 'ANSI_378'],
      };
    }
  }

  async getDeviceInfo(): Promise<ScannerDeviceInfo> {
    this.device = await this.buildDeviceInfo(this.device?.id);
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
    // Fire off background capture; captureFingerprint manages the busy flag.
    void this.captureFingerprint(options);
  }

  async stopCapture(): Promise<void> {
    this.sdk.stopCapture();
    this.busy = false;
    this.emit('finger_removed', { kind: 'finger_removed' });
  }

  async captureFingerprint(options?: CaptureOptions): Promise<CapturedTemplate> {
    if (this.busy && options?.timeoutMs === undefined) {
      throw new Error('Scanner is busy');
    }
    this.busy = true;
    this.emit('finger_detected', { kind: 'finger_detected' });

    try {
      const timeoutMs  = options?.timeoutMs ?? 12000;
      const minQuality = options?.quality   ?? 40;

      // MSO SDK: one atomic call captures the image and extracts the template.
      const cap = await this.sdk.capture(timeoutMs, minQuality);

      if (cap.quality > 0 && cap.quality < minQuality) {
        this.emit('poor_quality', { kind: 'poor_quality', quality: cap.quality });
      }

      // Extract a clean ISO template from the raw image buffer.
      const templ = await this.sdk.createTemplate(
        cap.rawImage,
        minQuality,
        MSOTemplateFormat.ISO19794_2,
      );

      this.emit('captured', { kind: 'captured', quality: templ.quality });

      const device = await this.getDeviceInfo();
      const templatePayload = templ.template.toString('base64');

      // Zero the raw image immediately — it must never be persisted.
      cap.rawImage.fill(0);

      return {
        templatePayload,
        format:    MSO_FORMAT_LABELS[templ.format] ?? 'ISO_19794_2',
        quality:   templ.quality,
        nfiq:      cap.nfiq ?? undefined,
        deviceId:  device.id,
        capturedAt: cap.capturedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MSO 1300 capture failed';
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
    const samplesRequired = options?.samples   ?? 3;
    const timeoutMs       = options?.timeoutMs ?? 12000;
    const minQuality      = options?.quality   ?? 40;

    const samples: CapturedTemplate[] = [];
    for (let i = 0; i < samplesRequired; i++) {
      this.emit('enrollment_sample', {
        kind: 'enrollment_sample',
        sample: i + 1,
        of: samplesRequired,
        quality: 0,
      });
      const sample = await this.captureFingerprint({ timeoutMs, quality: minQuality });
      if (sample.quality < minQuality) {
        throw new Error(
          `Sample ${i + 1} quality ${sample.quality}% is below the minimum ${minQuality}%. ` +
            'Please rescan with a clean, dry finger.',
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
    this.emit('enrollment_complete', { kind: 'enrollment_complete', quality: best.quality });

    return {
      success: true,
      samplesCollected: samples.length,
      samplesRequired,
      quality: best.quality,
      templatePayload: best.templatePayload,
      format: best.format,
      deviceId: best.deviceId,
      message: `Enrolled ${samples.length} sample(s) via Idemia MSO 1300 E3.`,
    };
  }

  async verify(
    referenceTemplate: { templatePayload: string; format: string } | null,
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    if (!referenceTemplate) {
      // Backend performs the match; bridge only captures.
      return { matched: false, captured };
    }

    try {
      const probe     = Buffer.from(captured.templatePayload, 'base64');
      const reference = Buffer.from(referenceTemplate.templatePayload, 'base64');
      const { matched, score } = await this.sdk.matchTemplates(probe, reference);
      this.emit(matched ? 'match_found' : 'no_match', {
        kind: matched ? 'match_found' : 'no_match',
        score,
      } as never);
      return { matched, score: normalizeScore(score) };
    } catch {
      return { matched: false, score: 0, captured };
    }
  }

  async identify(
    candidates: MatchCandidate[],
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    if (!candidates.length) {
      // Backend performs 1:N search; bridge only captures.
      return { matched: false, captured };
    }

    const probe = Buffer.from(captured.templatePayload, 'base64');
    let best: { patientId: string; score: number } | null = null;

    for (const candidate of candidates) {
      try {
        const gallery = Buffer.from(candidate.templatePayload, 'base64');
        const { matched, score } = await this.sdk.matchTemplates(probe, gallery);
        if (matched && (!best || score > best.score)) {
          best = { patientId: candidate.patientId, score };
        }
      } catch {
        // Skip malformed candidate templates.
      }
    }

    if (best) {
      this.emit('match_found', { kind: 'match_found', score: best.score } as never);
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
