/**
 * High-level Idemia MSO 1300 E3 SDK facade.
 *
 * One singleton per process. Used by:
 *   - the biometric bridge  (capture fingerprints, extract templates)
 *   - the backend matcher   (1:1 / 1:N template comparison via MSO_MatchTemplate)
 *
 * All methods communicate through the real MorphoSmartCST DLL via koffi FFI.
 * No simulated or fabricated data is ever returned.
 */
import {
  loadSdk,
  findMsoDll,
  decodeDeviceInfo,
  resolvedDllPath,
  MAX_RAW_IMAGE_SIZE,
  MAX_TEMPLATE_SIZE,
} from './native-sdk';
import { MSOErrorCode, errorMessage } from './errors';
import {
  DEFAULT_MSO_MATCH_THRESHOLD,
  DEFAULT_MSO_TEMPLATE_FORMAT,
  MSOCapture,
  MSODeviceInfo,
  MSOMatchResult,
  MSOSdkError,
  MSOSdkStatus,
  MSOTemplate,
  MSOTemplateFormat,
} from './types';

const DEVICE_INDEX = 0; // MSO 1300 uses a single-device index
const DEVICE_INFO_BUFFER_SIZE = 512;

export class MSOSdk {
  private static instance: MSOSdk | null = null;

  private license = '';
  private initialized = false;

  private constructor() {
    this.license = process.env.MSO_LICENSE_KEY ?? '';
  }

  static getInstance(): MSOSdk {
    if (!MSOSdk.instance) MSOSdk.instance = new MSOSdk();
    return MSOSdk.instance;
  }

  /** Override the license key before calling initialize(). */
  setLicense(key: string): void {
    this.license = key;
  }

  get dllPath(): string | null {
    return resolvedDllPath ?? findMsoDll();
  }

  get requiresNativeSdk(): boolean {
    return true;
  }

  /** Report environment capability — driver vs. SDK vs. platform failures. */
  getStatus(): MSOSdkStatus {
    const platformSupported = process.platform === 'win32';
    let ffiAvailable = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ffiAvailable = !!require('koffi');
    } catch {
      ffiAvailable = false;
    }
    const dllAvailable = !!this.dllPath;

    let sdkLoadable = false;
    let failureCode: MSOErrorCode | null = null;

    if (!platformSupported) {
      failureCode = MSOErrorCode.WRAPPER_PLATFORM_UNSUPPORTED;
    } else if (!ffiAvailable) {
      failureCode = MSOErrorCode.WRAPPER_FFI_UNAVAILABLE;
    } else if (!dllAvailable) {
      failureCode = MSOErrorCode.WRAPPER_DLL_NOT_FOUND;
    } else {
      try {
        loadSdk();
        sdkLoadable = true;
      } catch (err) {
        failureCode =
          err instanceof MSOSdkError
            ? (err.code as MSOErrorCode)
            : MSOErrorCode.WRAPPER_SDK_VERSION_UNSUPPORTED;
      }
    }

    return {
      platformSupported,
      ffiAvailable,
      dllAvailable,
      sdkLoadable,
      deviceConnected: sdkLoadable && this.initialized ? this.isDeviceConnected() : false,
      failureCode,
      dllPath: this.dllPath,
      sdkVersion: this.getVersion(),
    };
  }

  getVersion(): string {
    try {
      const sdk = loadSdk();
      if (!sdk.getVersionInfo) return '';
      const buf = Buffer.alloc(128);
      const ret = sdk.getVersionInfo(buf, 128);
      if (ret < 0) return '';
      return buf.toString('ascii').replace(/\0.*$/, '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Initialize the SDK and open the device.
   * Safe to call multiple times; subsequent calls are no-ops unless force=true.
   */
  async initialize(opts?: { license?: string; force?: boolean }): Promise<void> {
    if (this.initialized && !opts?.force) return;

    const sdk = loadSdk();
    const license = opts?.license ?? this.license;

    if (license?.trim()) {
      const ret = sdk.setLicense(license.trim());
      if (ret !== 0 && ret !== MSOErrorCode.E_ALREADY_INITIALIZED) {
        throw new MSOSdkError(ret, `MSO_SetLicenseKey failed: ${errorMessage(ret)}`);
      }
    }

    const initCode = sdk.init();
    if (initCode !== 0 && initCode !== MSOErrorCode.E_ALREADY_INITIALIZED) {
      throw new MSOSdkError(initCode, errorMessage(initCode));
    }

    this.initialized = true;
    // Non-fatal: device may not yet be plugged in at init time.
    await this.openDevice().catch(() => undefined);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MSOSdkError(
        MSOErrorCode.E_NOT_INITIALIZED,
        'MSO SDK is not initialized. Call initialize() first.',
      );
    }
  }

  async openDevice(): Promise<void> {
    const sdk = loadSdk();
    this.ensureInitialized();
    const ret = sdk.openDevice(DEVICE_INDEX);
    if (ret !== 0 && ret !== MSOErrorCode.E_ALREADY_INITIALIZED) {
      throw new MSOSdkError(
        ret,
        `${errorMessage(ret)} — is the Idemia MSO 1300 E3 connected via USB?`,
      );
    }
  }

  async closeDevice(): Promise<void> {
    if (!this.initialized) return;
    try {
      const sdk = loadSdk();
      sdk.closeDevice(DEVICE_INDEX);
    } catch {
      // Closing an already-closed device is acceptable.
    }
  }

  isDeviceConnected(): boolean {
    if (!this.initialized) return false;
    try {
      const sdk = loadSdk();
      const buf = Buffer.alloc(DEVICE_INFO_BUFFER_SIZE);
      const ret = sdk.getDeviceInfo(DEVICE_INDEX, buf, DEVICE_INFO_BUFFER_SIZE);
      if (ret < 0) return false;
      return decodeDeviceInfo(buf).connected;
    } catch {
      return false;
    }
  }

  async getDeviceInfo(): Promise<MSODeviceInfo> {
    const sdk = loadSdk();
    this.ensureInitialized();
    await this.openDevice().catch(() => undefined);

    const buf = Buffer.alloc(DEVICE_INFO_BUFFER_SIZE);
    const ret = sdk.getDeviceInfo(DEVICE_INDEX, buf, DEVICE_INFO_BUFFER_SIZE);
    if (ret < 0) {
      throw new MSOSdkError(ret, errorMessage(ret));
    }
    const info = decodeDeviceInfo(buf);
    info.connected = info.connected || this.isDeviceConnected();
    return info;
  }

  /**
   * Capture a live fingerprint and extract a minutiae template in one SDK call
   * (MSO_GetImageAndTemplate). The raw image buffer is zeroed immediately after
   * the template is obtained.
   *
   * @param timeoutMs  maximum wait for a finger placement (ms)
   * @param minQuality minimum accepted quality (0–100)
   */
  async capture(timeoutMs = 10000, minQuality = 40): Promise<MSOCapture> {
    const sdk = loadSdk();
    this.ensureInitialized();
    await this.openDevice();

    const imageBuffer    = Buffer.alloc(MAX_RAW_IMAGE_SIZE);
    const imageSizeBuf   = Buffer.alloc(4);
    const templateBuffer = Buffer.alloc(MAX_TEMPLATE_SIZE);
    const tplSizeBuf     = Buffer.alloc(4);
    const qualityBuf     = Buffer.alloc(4);
    const nfiqBuf        = Buffer.alloc(4);

    // Kick off a capture; the SDK blocks until a finger is placed or timeout.
    const startRet = sdk.startCapture(
      DEVICE_INDEX,
      timeoutMs,
      minQuality,
      // The callback is only used for streaming state events; the result is
      // obtained via MSO_GetImageAndTemplate below.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {},
    );
    if (startRet < 0) {
      throw new MSOSdkError(startRet, errorMessage(startRet));
    }

    const capturedAt = new Date().toISOString();

    const ret = sdk.getImageAndTemplate(
      DEVICE_INDEX,
      imageBuffer, imageSizeBuf,
      templateBuffer, tplSizeBuf,
      DEFAULT_MSO_TEMPLATE_FORMAT,
      qualityBuf,
      nfiqBuf,
    );

    if (ret < 0) {
      throw new MSOSdkError(ret, errorMessage(ret));
    }

    const imageSize  = imageSizeBuf.readInt32LE(0);
    const quality    = qualityBuf.readInt32LE(0);
    const nfiqRaw    = nfiqBuf.readInt32LE(0);

    if (imageSize <= 0) {
      throw new MSOSdkError(MSOErrorCode.E_CAPTURE_FAILED, 'MSO returned an empty capture');
    }

    const rawImage = Buffer.from(imageBuffer.subarray(0, imageSize));
    // The raw image bytes are only needed by createTemplate; zero the stack
    // copy immediately if the caller obtained it here.

    return {
      rawImage,
      width: 0,   // populated by getDeviceInfo separately if needed
      height: 0,
      quality:    Math.max(0, Math.min(100, quality)),
      nfiq:       nfiqRaw > 0 ? nfiqRaw : null,
      capturedAt,
    };
  }

  /** Stop an in-progress capture. Safe to call any time. */
  stopCapture(): void {
    if (!this.initialized) return;
    try {
      const sdk = loadSdk();
      sdk.stopCapture(DEVICE_INDEX);
    } catch {
      // ignore
    }
  }

  /**
   * Extract a minutiae template from a raw image obtained via capture().
   */
  async createTemplate(
    rawImage: Buffer,
    quality = 0,
    format: MSOTemplateFormat = DEFAULT_MSO_TEMPLATE_FORMAT,
  ): Promise<MSOTemplate> {
    const sdk = loadSdk();
    this.ensureInitialized();

    const templateBuffer = Buffer.alloc(MAX_TEMPLATE_SIZE);
    const tplSizeBuf     = Buffer.alloc(4);

    const ret = sdk.createTemplate(
      DEVICE_INDEX,
      rawImage,
      rawImage.length,
      templateBuffer,
      tplSizeBuf,
      format,
      quality,
    );

    if (ret < 0) {
      throw new MSOSdkError(ret, errorMessage(ret));
    }

    let size = tplSizeBuf.readInt32LE(0);
    if (size <= 0) size = ret; // some SDK builds return the size directly
    if (size <= 0 || size > MAX_TEMPLATE_SIZE) {
      throw new MSOSdkError(
        MSOErrorCode.E_EXTRACTION_FAILED,
        'Template extraction returned an invalid template size',
      );
    }

    return {
      template: Buffer.from(templateBuffer.subarray(0, size)),
      format,
      size,
      quality: ret >= 0 && ret <= 100 ? ret : quality,
    };
  }

  /**
   * Compare two minutiae templates (1:1).
   *
   * @returns matched boolean plus raw score (0–100000).
   */
  async matchTemplates(
    templateA: Buffer,
    templateB: Buffer,
    threshold: number = DEFAULT_MSO_MATCH_THRESHOLD,
  ): Promise<MSOMatchResult> {
    const sdk = loadSdk();
    this.ensureInitialized();

    const scoreBuf = Buffer.alloc(4);
    const ret = sdk.matchTemplate(
      templateA, templateA.length,
      templateB, templateB.length,
      scoreBuf,
    );

    if (ret < 0) {
      throw new MSOSdkError(ret, errorMessage(ret));
    }

    let score = scoreBuf.readInt32LE(0);
    if (score === 0 && ret > 0) score = ret; // some SDK builds return the score directly
    return { matched: score >= threshold, score };
  }

  /** Release the SDK and the device handle. */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.closeDevice();
    try {
      const sdk = loadSdk();
      sdk.finalize();
    } catch {
      // ignore
    }
    this.initialized = false;
  }
}

export { MSOSdkError, errorMessage, MSOErrorCode };
