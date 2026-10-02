import { MSOErrorCode } from './errors';

/**
 * Template formats supported by the Idemia MSO SDK (MorphoSmartCST).
 * The E3 series supports ISO 19794-2 (MINEX-compliant minutiae) natively.
 */
export enum MSOTemplateFormat {
  ISO19794_2 = 0,      // ISO 19794-2:2005 minutiae record
  ANSI378 = 1,         // ANSI INCITS 378-2004 minutiae record
  ISO19794_2_2011 = 2, // ISO 19794-2:2011 minutiae record
  PROPRIETARY = 3,     // Idemia proprietary compressed format
}

export const DEFAULT_MSO_TEMPLATE_FORMAT = MSOTemplateFormat.ISO19794_2;

/**
 * Match score threshold for the Idemia MSO SDK.
 * The SDK reports a normalised score 0–100000; Idemia recommend ≥ 14000 as a
 * match threshold (same as the MFS100 convention).
 */
export const DEFAULT_MSO_MATCH_THRESHOLD = 14000;

/** Template format labels used end-to-end by Medivault. */
export const MSO_FORMAT_LABELS: Record<number, string> = {
  [MSOTemplateFormat.ISO19794_2]:      'ISO_19794_2',
  [MSOTemplateFormat.ANSI378]:         'ANSI_378',
  [MSOTemplateFormat.ISO19794_2_2011]: 'ISO_19794_2_2011',
  [MSOTemplateFormat.PROPRIETARY]:     'MSO_PROPRIETARY',
};

/** A raw fingerprint image captured from the sensor (memory only, never persisted). */
export interface MSOCapture {
  /** Raw grayscale image bytes — transient, must not be stored or logged. */
  rawImage: Buffer;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** SDK quality estimate 0–100. */
  quality: number;
  /** NFIQ quality grade 1 (best) … 5 (worst), when available. */
  nfiq: number | null;
  /** ISO timestamp of the capture. */
  capturedAt: string;
}

/** Minutiae template produced by MSO_CreateTemplate. */
export interface MSOTemplate {
  /** Binary template (ISO 19794-2 / ANSI 378 minutiae). Never returned to browsers. */
  template: Buffer;
  /** Template format. */
  format: MSOTemplateFormat;
  /** Template size in bytes. */
  size: number;
  /** Quality estimate of the source image 0–100. */
  quality: number;
}

/** Result of MSO_MatchTemplate. */
export interface MSOMatchResult {
  /** Whether the score cleared the configured threshold. */
  matched: boolean;
  /** Raw SDK match score (0–100000). */
  score: number;
}

/** Static properties reported by the MSO device. */
export interface MSODeviceInfo {
  serialNumber: string;
  productName: string;
  manufacturerName: string;
  firmwareVersion: string;
  hardwareVersion: string;
  width: number;
  height: number;
  resolution: number;
  connected: boolean;
}

/** Error thrown by the MSO SDK wrapper with a stable machine-readable code. */
export class MSOSdkError extends Error {
  readonly code: MSOErrorCode | number;
  readonly sdkCode: number;

  constructor(code: MSOErrorCode | number, message?: string, sdkCode: number = code) {
    super(message ?? `MSO SDK error ${code}`);
    this.name = 'MSOSdkError';
    this.code = code;
    this.sdkCode = sdkCode;
  }
}

/** Environment capability report — used to detect "driver missing / SDK missing". */
export interface MSOSdkStatus {
  /** Whether the platform is a supported Windows x64 build. */
  platformSupported: boolean;
  /** Whether the FFI runtime (koffi) is loadable. */
  ffiAvailable: boolean;
  /** Whether MorphoSmartCST.dll was located. */
  dllAvailable: boolean;
  /** Whether all required SDK symbols were resolved. */
  sdkLoadable: boolean;
  /** Whether a device was detected and initialized. */
  deviceConnected: boolean;
  /** Detailed failure code if not fully operational. */
  failureCode: MSOErrorCode | null;
  /** Resolved DLL path. */
  dllPath: string | null;
  /** SDK version string reported by the DLL (empty if unavailable). */
  sdkVersion: string;
}
