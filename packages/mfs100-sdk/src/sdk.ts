/**
 * High-level MFS100 SDK facade.
 *
 * One instance per process. Used by:
 *   - the biometric bridge  (capture fingerprints, extract templates)
 *   - the backend matcher   (match capture templates against enrolled ones)
 *
 * All methods return real SDK results obtained through FFI. No simulated data.
 */
import {
  loadSdk,
  findMfs100Dll,
  decodeDeviceInfo,
  DEVICE_INFO_BUFFER_SIZE,
  MAX_RAW_IMAGE_SIZE,
  MAX_TEMPLATE_SIZE,
  resolvedDllPath,
} from './native-sdk';
import { MFS100ErrorCode, errorMessage } from './errors';
import {
  DEFAULT_MFS100_MATCH_THRESHOLD,
  DEFAULT_MFS100_TEMPLATE_FORMAT,
  MFS100Capture,
  MFS100DeviceInfo,
  MFS100MatchResult,
  MFS100SdkError,
  MFS100SdkStatus,
  MFS100Template,
  MFS100TemplateFormat,
} from './types';

interface CaptureData {
  quality: number;
  nfiq: number;
}

function decodeCaptureData(buffer: Buffer | null): CaptureData {
  if (!buffer || buffer.length < 8) return { quality: 0, nfiq: 0 };
  return {
    quality: buffer.readInt32LE(0) || 0,
    nfiq: buffer.readInt32LE(4) || 0,
  };
}

export class MFS100Sdk {
  private static instance: MFS100Sdk | null = null;

  /** Slot used for all MFS100 API calls. */
  private readonly slot = 0;
  private license = '';
  private initialized = false;
  private bootstrapped = false;

  private constructor() {
    // read licence at construction time so setLicense() is easy to call before init
    this.license = process.env.MFS100_LICENSE_KEY ?? '';
  }

  static getInstance(): MFS100Sdk {
    if (!MFS100Sdk.instance) MFS100Sdk.instance = new MFS100Sdk();
    return MFS100Sdk.instance;
  }

  /** Configure the SDK license before initialize() (MFS100_LICENSE_KEY by default). */
  setLicense(licenseData: string): void {
    this.license = licenseData;
  }

  get dllPath(): string | null {
    return resolvedDllPath ?? findMfs100Dll();
  }

  get requiresNativeSdk(): boolean {
    return true;
  }

  /** Report exactly why the SDK cannot run (driver vs. SDK vs. platform). */
  getStatus(): MFS100SdkStatus {
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
    let failureCode: MFS100ErrorCode | null = null;
    if (!platformSupported) failureCode = MFS100ErrorCode.WRAPPER_PLATFORM_UNSUPPORTED;
    else if (!ffiAvailable) failureCode = MFS100ErrorCode.WRAPPER_FFI_UNAVAILABLE;
    else if (!dllAvailable) failureCode = MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND;
    else {
      try {
        loadSdk();
        sdkLoadable = true;
      } catch (err) {
        failureCode =
          err instanceof MFS100SdkError
            ? (err.code as MFS100ErrorCode)
            : MFS100ErrorCode.WRAPPER_SDK_VERSION_UNSUPPORTED;
      }
    }

    return {
      platformSupported,
      ffiAvailable,
      dllAvailable,
      sdkLoadable,
      deviceConnected: sdkLoadable ? this.isDeviceConnected() : false,
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
      const ret = sdk.getVersionInfo(buf);
      if (ret !== 0) return '';
      return buf.toString('ascii').replace(/\0.*$/, '').trim();
    } catch {
      return '';
    }
  }

  /** Initialize the SDK; open the device once it is available. */
  async initialize(opts?: { license?: string; force?: boolean }): Promise<void> {
    const sdk = loadSdk();
    const license = opts?.license ?? this.license;

    if (this.initialized && !opts?.force) return;

    if (license && license.trim()) {
      const setData = sdk.setLicenseData(license.trim());
      if (setData !== 0 && setData !== -110) {
        // -110 == already set is tolerated; anything else is fatal
        throw new MFS100SdkError(setData, errorMessage(setData));
      }
    }

    const initCode = sdk.init();
    if (initCode !== 0) {
      // Not fatal if "already initialized"
      if (initCode !== MFS100ErrorCode.E_ALREADY_INITIALIZED) {
        throw new MFS100SdkError(initCode, errorMessage(initCode));
      }
    }

    this.initialized = true;
    void this.openDevice();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MFS100SdkError(
        MFS100ErrorCode.E_NOT_INITIALIZED,
        'MFS100 SDK is not initialized. Call initialize() first.',
      );
    }
  }

  /** Open the device handle. Idempotent. */
  async openDevice(): Promise<void> {
    const sdk = loadSdk();
    this.ensureInitialized();
    const ret = sdk.openDevice(this.slot, 1);
    if (ret !== 0 && ret !== MFS100ErrorCode.E_ALREADY_INITIALIZED) {
      throw new MFS100SdkError(ret, errorMessage(ret) + ' Is the scanner connected via USB?');
    }
  }

  async closeDevice(): Promise<void> {
    if (!this.initialized) return;
    try {
      const sdk = loadSdk();
      sdk.closeDevice(this.slot);
    } catch {
      // ignore — closing an already-closed device is fine
    }
  }

  /** Is the sensor physically connected and usable right now? */
  isDeviceConnected(): boolean {
    if (!this.initialized) return false;
    try {
      const sdk = loadSdk();
      const ret = sdk.checkFinger(this.slot);
      // 0 means device present; negative codes mean the device is absent
      return ret === 0 || ret > 0;
    } catch {
      return false;
    }
  }

  async getDeviceInfo(): Promise<MFS100DeviceInfo> {
    const sdk = loadSdk();
    this.ensureInitialized();
    await this.openDevice().catch(() => undefined);
    const buffer = Buffer.alloc(DEVICE_INFO_BUFFER_SIZE);
    const ret = sdk.getDeviceInfo(this.slot, buffer);
    if (ret !== 0) {
      throw new MFS100SdkError(ret, errorMessage(ret));
    }
    const info = decodeDeviceInfo(buffer);
    info.connected = info.connected || this.isDeviceConnected();
    return info;
  }

  /**
   * Capture a live fingerprint.
   *
   * @param timeoutMs maximum time to wait for a finger
   * @param minQuality minimum quality (0-100) required before SDK returns
   * @returns transient raw image + quality metadata
   */
  async capture(timeoutMs = 10000, minQuality = 40): Promise<MFS100Capture> {
    const sdk = loadSdk();
    this.ensureInitialized();
    await this.openDevice();

    const imageBuffer = Buffer.alloc(MAX_RAW_IMAGE_SIZE);
    const captureDataBuffer = Buffer.alloc(16);
    const deviceInfoBuffer = Buffer.alloc(DEVICE_INFO_BUFFER_SIZE);

    return new Promise<MFS100Capture>((resolve, reject) => {
      let settled = false;
      const capturedAt = new Date().toISOString();

      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          sdk.stopCapture(this.slot);
        } catch {
          // stopCapture can fail after timeout — ignore
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timer = setTimeout(() => {
        if (!settled) {
          fail(
            new MFS100SdkError(
              MFS100ErrorCode.E_FW_TIMEOUT,
              errorMessage(MFS100ErrorCode.E_FW_TIMEOUT),
            ),
          );
        }
      }, timeoutMs + 2000);

      const captureCallback = (
        _ctx: unknown,
        _devInfo: unknown,
        img: Buffer,
        size: number,
        data: Buffer,
      ): void => {
        if (settled) return;
        clearTimeout(timer);
        try {
          sdk.stopCapture(this.slot);
        } catch {
          // ignore
        }
        if (!img || size <= 0) {
          fail(
            new MFS100SdkError(
              MFS100ErrorCode.E_CAPTURE_FAILED,
              'MFS100 returned an empty capture',
            ),
          );
          return;
        }
        const copy = Buffer.from(img.subarray(0, size));
        const meta = decodeCaptureData(data);
        const info = decodeDeviceInfo(deviceInfoBuffer);
        settled = true;
        resolve({
          rawImage: copy,
          width: info.width || 0,
          height: info.height || 0,
          quality: meta.quality || 0,
          nfiq: meta.nfiq > 0 ? meta.nfiq : null,
          capturedAt,
        });
      };

      const ret = sdk.startCapture(this.slot, timeoutMs, minQuality, captureCallback);
      if (ret !== 0) {
        fail(new MFS100SdkError(ret, errorMessage(ret)));
      }
    });
  }

  /** Finger currently resting on the sensor? */
  checkFinger(): boolean {
    if (!this.initialized) return false;
    try {
      const sdk = loadSdk();
      return sdk.checkFinger(this.slot) === 0;
    } catch {
      return false;
    }
  }

  /** Stop any active capture. Safe to call any time. */
  stopCapture(): void {
    if (!this.initialized) return;
    try {
      const sdk = loadSdk();
      sdk.stopCapture(this.slot);
    } catch {
      // ignore
    }
  }

  /**
   * Create an ISO/ANSI minutiae template from a captured raw image.
   *
   * @param rawImage raw image returned by capture()
   * @param quality minimum quality to enforce (0 disables)
   * @param format template format
   */
  async createTemplate(
    rawImage: Buffer,
    quality = 0,
    format: MFS100TemplateFormat = DEFAULT_MFS100_TEMPLATE_FORMAT,
  ): Promise<MFS100Template> {
    const sdk = loadSdk();
    this.ensureInitialized();

    const templateBuffer = Buffer.alloc(MAX_TEMPLATE_SIZE);
    const sizeBuffer = Buffer.alloc(4);
    const duplicateScoreBuffer = Buffer.alloc(4);

    const ret = sdk.createTemplate(
      this.slot,
      rawImage,
      rawImage.length,
      quality,
      templateBuffer,
      sizeBuffer,
      format,
      0, // do not check duplicates against previously enrolled
      40, // duplicate threshold (unused when checking disabled)
      duplicateScoreBuffer,
    );

    if (ret < 0) {
      throw new MFS100SdkError(ret, errorMessage(ret));
    }

    let size = sizeBuffer.readUInt32LE(0);
    if (size <= 0) size = ret; // some SDK builds return the size directly
    if (size <= 0 || size > MAX_TEMPLATE_SIZE) {
      throw new MFS100SdkError(
        MFS100ErrorCode.E_EXTRACTION_FAILED,
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

  /** Convenience: capture a finger and immediately extract a template. */
  async captureAndCreateTemplate(timeoutMs = 10000, minQuality = 40): Promise<MFS100Template> {
    const cap = await this.capture(timeoutMs, minQuality);
    const templ = await this.createTemplate(cap.rawImage, minQuality);
    // raw fingerprint image is dropped here — never persisted
    cap.rawImage.fill(0);
    return templ;
  }

  /**
   * Compare two templates.
   *
   * @returns score and match boolean (threshold 0-100000, default 14000).
   */
  async matchTemplates(
    templateA: Buffer,
    templateB: Buffer,
    threshold: number = DEFAULT_MFS100_MATCH_THRESHOLD,
  ): Promise<MFS100MatchResult> {
    const sdk = loadSdk();
    this.ensureInitialized();

    const scoreBuffer = Buffer.alloc(4);
    const ret = sdk.matchTemplate(
      this.slot,
      templateA,
      templateA.length,
      templateB,
      templateB.length,
      scoreBuffer,
    );

    if (ret < 0) {
      throw new MFS100SdkError(ret, errorMessage(ret));
    }

    let score = scoreBuffer.readInt32LE(0);
    if (score === 0 && ret > 0) score = ret; // some SDK builds return the score directly
    return { matched: score >= threshold, score };
  }

  /** Release the SDK and device. */
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

export { MFS100SdkError, errorMessage, MFS100ErrorCode };
