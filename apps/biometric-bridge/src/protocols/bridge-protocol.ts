/**
 * Biometric bridge protocol — HTTP + WebSocket contracts, shared types.
 *
 * TRANSPORT SECURITY
 * The bridge binds to 127.0.0.1 only. If BIOMETRIC_BRIDGE_TOKEN is set, every
 * HTTP request must carry `Authorization: Bearer <token>` and every WebSocket
 * client must send `{ type: 'hello', token }` first.
 *
 * FINGERPRINT SECURITY
 * The bridge NEVER returns a raw minutiae template to the browser. Captures
 * are relayed as an opaque AES-256-GCM ciphertext ("MV1:" prefix) plus an HMAC
 * signature computed with BIOMETRIC_BRIDGE_SECRET. The backend decrypts and
 * verifies before matching. Raw templates only exist inside the bridge process
 * and the backend matcher (transient, in-memory).
 */

// ─── Common data ──────────────────────────────────────────────────────────────

export interface BridgeStatus {
  connected: boolean;
  ready: boolean;
  scannerName: string | null;
  scannerId: string | null;
  adapterId: string | null;
  firmwareVersion: string | null;
  deviceCount: number;
  devices: BridgeDevice[];
  /** Why the bridge is not ready when a scanner is physically present. */
  error?: string | null;
}

export interface BridgeDevice {
  vendorId: number;
  productId: number;
  serialNumber: string;
  deviceName: string;
  adapterId: string;
}

/** Capture result returned to clients (opaque payload, no raw template). */
export interface CapturedData {
  /** Opaque AES-256-GCM ciphertext ("MV1:...") — NOT a readable template. */
  templatePayload: string;
  format: string;
  quality: number;
  nfiq?: number;
  deviceId: string;
  capturedAt: string;
  bridgeSignature?: string;
}

export interface MatchResultData {
  matched: boolean;
  score?: number;
  patientId?: string;
  templateId?: string;
}

export interface BridgeResponse<T = unknown> {
  id?: string;
  type: 'response';
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ─── WebSocket protocol (path /ws) ────────────────────────────────────────────

export type WsClientMessage =
  | { id: string; type: 'hello'; token?: string }
  | { id: string; type: 'get-status' }
  | { id: string; type: 'detect' }
  | { id: string; type: 'connect' }
  | { id: string; type: 'disconnect' }
  | {
      id: string;
      type: 'capture';
      timeoutMs?: number;
      quality?: number;
    }
  | { id: string; type: 'start-capture'; timeoutMs?: number; quality?: number }
  | { id: string; type: 'stop-capture' }
  | {
      id: string;
      type: 'enroll';
      samples?: number;
      finger?: string;
      timeoutMs?: number;
      quality?: number;
    }
  | {
      id: string;
      type: 'verify';
      referenceTemplate?: { templatePayload: string; format: string };
      timeoutMs?: number;
      quality?: number;
    }
  | {
      id: string;
      type: 'identify';
      candidates?: WsMatchCandidate[];
      timeoutMs?: number;
      quality?: number;
    };

export interface WsMatchCandidate {
  patientId: string;
  templatePayload: string;
  format: string;
}

export type WsServerMessage =
  | BridgeResponse
  | { id?: string; type: 'hello-accepted' }
  | { type: 'status'; data: BridgeStatus }
  | { type: 'state'; state: WsScannerState }
  | { type: 'captured'; data: CapturedData };

export type WsScannerState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'capturing'
  | 'finger_detected'
  | 'finger_removed'
  | 'poor_quality'
  | 'captured'
  | 'capture_failed'
  | 'match_found'
  | 'no_match'
  | 'enrollment_sample'
  | 'enrollment_complete'
  | 'error'
  | 'ready';

// ─── HTTP protocol (same port 9876) ──────────────────────────────────────────

export type HttpRoute =
  | ['GET', '/health']
  | ['GET', '/scanner/status']
  | ['POST', '/scanner/detect']
  | ['POST', '/scanner/connect']
  | ['POST', '/scanner/disconnect']
  | ['POST', '/scanner/capture']
  | ['POST', '/scanner/enroll']
  | ['POST', '/scanner/verify']
  | ['POST', '/scanner/identify']
  | ['POST', '/scanner/stop-capture'];

export interface CaptureBody {
  timeoutMs?: number;
  quality?: number;
}

export interface EnrollBody extends CaptureBody {
  samples?: number;
  finger?: string;
}

export interface MatchBody extends CaptureBody {
  referenceTemplate?: { templatePayload: string; format: string };
  candidates?: WsMatchCandidate[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export const BRIDGE_ERRORS = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  BUSY: 'BUSY',
  NO_DEVICE: 'NO_DEVICE',
  SDK_MISSING: 'SDK_MISSING',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  CANCELLED: 'CANCELLED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
} as const;

export type BridgeErrorCode = (typeof BRIDGE_ERRORS)[keyof typeof BRIDGE_ERRORS];

// ─── Config helpers ───────────────────────────────────────────────────────────

export const BRIDGE_PORT = parseInt(process.env.BIOMETRIC_BRIDGE_PORT ?? '9876', 10);
export const BRIDGE_HOST = process.env.BIOMETRIC_BRIDGE_HOST ?? '127.0.0.1';
export const BRIDGE_WS_URL = `ws://${BRIDGE_HOST}:${BRIDGE_PORT}/ws`;
export const BRIDGE_HTTP_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}`;
export const BRIDGE_VERSION = '1.0.0';

/** true when bridge authentication is enabled. */
export function bridgeAuthEnabled(): boolean {
  return Boolean(process.env.BIOMETRIC_BRIDGE_TOKEN);
}
