import { MFS100ErrorCode } from './errors';

/** Template formats supported by the MFS100 SDK. */
export enum MFS100TemplateFormat {
  ANSI378 = 0,
  ISO19794_2 = 1,
  ISO19794_2_2007 = 2,
  FUTRONIC_16 = 3,
  FUTRONIC_32 = 4,
}

export const DEFAULT_MFS100_TEMPLATE_FORMAT = MFS100TemplateFormat.ISO19794_2;

/**
 * Minutiae matching threshold used by MFS100_MatchTemplate.
 * The SDK reports a score between 0 and 100000; per Mantra documentation a
 * score of >= 14000 is considered a match.
 */
export const DEFAULT_MFS100_MATCH_THRESHOLD = 14000;

/** A real fingerprint image captured from the sensor (memory only, never persisted). */
export interface MFS100Capture {
  /** Raw grayscale image bytes — this is transient and must not be stored/logged. */
  rawImage: Buffer;
  /** Raw image width in pixels. */
  width: number;
  /** Raw image height in pixels. */
  height: number;
  /** SDK quality estimate 0–100. */
  quality: number;
  /** NFIQ (NIST Fingerprint Image Quality) 1 best … 5 worst, if available. */
  nfiq: number | null;
  /** ISO timestamp of the capture. */
  capturedAt: string;
}

/** Fingerprint template produced by MFS100_CreateTemplate (ISO/ANSI minutiae format). */
export interface MFS100Template {
  /** Binary template (ISO 19794-2 / ANSI 378 minutiae). Never returned to browsers. */
  template: Buffer;
  /** Template format used to create it. */
  format: MFS100TemplateFormat;
  /** Template size in bytes. */
  size: number;
  /** Quality estimate of the source image 0–100. */
  quality: number;
}

/** Result of MFS100_MatchTemplate. */
export interface MFS100MatchResult {
  /** Whether the score cleared the configured threshold. */
  matched: boolean;
  /** Raw SDK match score (0–100000). */
  score: number;
}

/** Static properties reported by the MFS100 device. */
export interface MFS100DeviceInfo {
  serialNumber: string;
  productName: string;
  manufacturerName: string;
  softwareVersion: string;
  embeddedVersion: string;
  hardwareVersion: string;
  width: number;
  height: number;
  resolution: number;
  datatype: number;
  connected: boolean;
}

/** Error thrown by the SDK wrapper with a stable machine-readable code. */
export class MFS100SdkError extends Error {
  readonly code: MFS100ErrorCode | number;
  readonly sdkCode: number;

  constructor(code: MFS100ErrorCode | number, message?: string, sdkCode: number = code) {
    super(message ?? `MFS100 SDK error ${code}`);
    this.name = 'MFS100SdkError';
    this.code = code;
    this.sdkCode = sdkCode;
  }
}

/** Environment capability report — used to detect "driver missing / SDK missing". */
export interface MFS100SdkStatus {
  /** Whether the platform is a supported Windows build. */
  platformSupported: boolean;
  /** Whether the FFI runtime (koffi) is loadable. */
  ffiAvailable: boolean;
  /** Whether MFS100.dll was located. */
  dllAvailable: boolean;
  /** Whether all required SDK symbols were resolved. */
  sdkLoadable: boolean;
  /** Whether a device was detected and initialized. */
  deviceConnected: boolean;
  /** Detailed failure code if not fully operational. */
  failureCode: MFS100ErrorCode | null;
  /** Resolved DLL path. */
  dllPath: string | null;
  /** SDK version string reported by the DLL (empty if unavailable). */
  sdkVersion: string;
}
