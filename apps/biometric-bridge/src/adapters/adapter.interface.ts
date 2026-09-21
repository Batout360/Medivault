/**
 * ScannerAdapter — pluggable interface for fingerprint scanner SDKs.
 *
 * Each adapter wraps a specific vendor SDK (or transport mechanism) and
 * provides a uniform capture/enroll/match API to the bridge server.
 *
 * To add support for a new scanner:
 *   1. Create a class implementing ScannerAdapter
 *   2. Register it in scanner-registry.ts
 *   3. The bridge auto-detects and routes to it
 *
 * SECURITY: adapters MUST return biometric *templates* (ISO/ANSI minutiae),
 * never raw fingerprint images. Raw images are transient, in-memory only.
 */
import { EventEmitter } from 'events';

// ─── Scanner events emitted by an adapter ───────────────────────────────────

export type ScannerStateEvent =
  | { kind: 'connecting' }
  | { kind: 'connected'; model?: string }
  | { kind: 'disconnected' }
  | { kind: 'capturing' }
  | { kind: 'finger_detected' }
  | { kind: 'finger_removed' }
  | { kind: 'poor_quality'; quality: number }
  | { kind: 'captured'; quality: number }
  | { kind: 'capture_failed'; error: string; code?: string }
  | { kind: 'match_found'; score?: number }
  | { kind: 'no_match' }
  | { kind: 'enrollment_sample'; sample: number; of: number; quality: number }
  | { kind: 'enrollment_complete'; quality: number }
  | { kind: 'error'; error: string; code?: string };

// ─── Data types ─────────────────────────────────────────────────────────────

export interface CapturedTemplate {
  /** Base64-encoded minutiae template (sent to backend for matching). */
  templatePayload: string;
  /** SDK/format identifier (e.g. "ISO_19794_2", "ANSI_378"). */
  format: string;
  /** ISO minutiae quality estimate 0–100. */
  quality: number;
  /** NFIQ quality grade 1 (best) … 5 (worst), when available. */
  nfiq?: number;
  /** Hardware device serial or identifier. */
  deviceId: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
  /** HMAC signature computed by the bridge (device/transport authentication). */
  bridgeSignature?: string;
}

export interface ScannerDeviceInfo {
  /** Unique device identifier (serial number). */
  id: string;
  /** Human-readable device name. */
  name: string;
  /** Device manufacturer. */
  manufacturer: string;
  /** Scanner model. */
  model: string;
  /** Firmware / SDK version string, when known. */
  firmwareVersion: string | null;
  /** Connection type. */
  connectionType: 'usb' | 'bluetooth' | 'network';
  /** Whether device is currently connected. */
  connected: boolean;
  /** Template formats this device/SDK can produce. */
  supportedFormats: string[];
}

export interface CaptureOptions {
  /** Max time to wait for a finger (ms). */
  timeoutMs?: number;
  /** Minimum acceptable quality (0–100). */
  quality?: number;
}

export interface EnrollOptions extends CaptureOptions {
  /** Number of samples to collect (multi-sample enrollment). */
  samples?: number;
  /** Description of the enrolled finger (e.g. "RIGHT_INDEX"). */
  finger?: string;
}

export interface BiometricMatchResult {
  matched: boolean;
  /** Match score 0–100 (normalised). */
  score?: number;
  /** Internal template id that matched (never the raw template). */
  templateId?: string;
  /** Optional patient linkage when the bridge owns enrolled templates. */
  patientId?: string;
  /** Present when the bridge only captured (no local matching was run). */
  captured?: CapturedTemplate;
}

/** Info supplied about a candidate when the bridge runs local matching. */
export interface MatchCandidate {
  patientId: string;
  templatePayload: string;
  format: string;
}

export interface ScannerAdapter extends EventEmitter {
  /** Unique adapter identifier (e.g. "mfs100", "generic-usb"). */
  readonly id: string;
  /** Human-readable adapter name. */
  readonly name: string;
  /** USB vendor IDs this adapter supports (empty array = none). */
  readonly supportedVendorIds: number[];

  /**
   * Probe whether this adapter can handle the given USB device.
   * Called during device detection to select the right adapter.
   */
  canHandle(vendorId: number, productId: number): boolean;

  /**
   * Initialize the adapter. For SDK-based adapters this loads the vendor
   * native runtime and initializes the device.
   *
   * @returns device info once ready.
   */
  initialize(deviceInfo?: {
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
  }): Promise<ScannerDeviceInfo>;

  /** Static info about the connected device. */
  getDeviceInfo(): Promise<ScannerDeviceInfo>;

  /** Whether the scanner is physically connected and ready. */
  isConnected(): Promise<boolean>;

  /** Start an interactive capture that emits state events as it progresses. */
  startCapture(options?: CaptureOptions): Promise<void>;

  /** Cancel an interactive capture. */
  stopCapture(): Promise<void>;

  /**
   * One-shot capture. Emits finger_detected / poor_quality / captured states
   * and resolves with a template.
   */
  captureFingerprint(options?: CaptureOptions): Promise<CapturedTemplate>;

  /**
   * Multi-sample enrollment. Collects N samples, quality-checks each, then
   * returns one combined template.
   */
  enroll(options?: EnrollOptions): Promise<{
    success: boolean;
    samplesCollected: number;
    samplesRequired: number;
    quality: number;
    templatePayload?: string;
    format?: string;
    deviceId?: string;
    message?: string;
  }>;

  /**
   * 1:1 verification against a reference template. If `referenceTemplate` is
   * omitted the bridge only captures (backend performs the match).
   */
  verify(
    referenceTemplate: { templatePayload: string; format: string } | null,
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult>;

  /**
   * 1:N identification against an optional candidate list. If `candidates` is
   * empty the bridge only captures (backend performs the match).
   */
  identify(candidates: MatchCandidate[], options?: CaptureOptions): Promise<BiometricMatchResult>;

  /** Release the device handle. Called on disconnect or shutdown. */
  dispose(): Promise<void>;
}
