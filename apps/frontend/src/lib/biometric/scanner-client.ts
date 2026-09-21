/**
 * Biometric scanner client — communicates with the local biometric bridge
 * (apps/biometric-bridge) over WebSocket, and returns captured fingerprint
 * templates.
 *
 * The bridge runs on the workstation where the scanner is physically
 * connected (ws://127.0.0.1:9876/ws). This client auto-reconnects and exposes
 * a promise-based request/response API.
 *
 * SECURITY: the payload returned by the bridge is an OPAQUE AES-256-GCM
 * ciphertext ("MV1:...") plus an HMAC signature. The frontend only relays it
 * to the backend and never decodes or interprets it.
 */

export interface BridgeStatus {
  connected: boolean;
  ready: boolean;
  scannerName: string | null;
  scannerId: string | null;
  adapterId: string | null;
  firmwareVersion: string | null;
  deviceCount: number;
  devices: BridgeDevice[];
  error?: string | null;
}

export interface BridgeDevice {
  vendorId: number;
  productId: number;
  serialNumber: string;
  deviceName: string;
  adapterId: string;
}

export interface CapturedData {
  templatePayload: string;
  format: string;
  quality: number;
  nfiq?: number;
  deviceId: string;
  capturedAt: string;
  bridgeSignature?: string;
}

export type EnrollResult = {
  success: boolean;
  samplesCollected: number;
  samplesRequired: number;
  quality: number;
  message?: string;
  format?: string;
  deviceId?: string;
  capturedAt?: string;
  templatePayload?: string;
  bridgeSignature?: string;
};

export type MatchResult = {
  matched: boolean;
  score?: number;
  patientId?: string;
  templateId?: string;
  captured?: CapturedData;
};

export type ScannerState =
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

export type ScannerEvent =
  | { type: 'status'; data: BridgeStatus }
  | { type: 'state'; state: ScannerState }
  | { type: 'captured'; data: CapturedData }
  | { type: 'response'; id?: string; ok: boolean; data?: unknown; error?: { code?: string; message: string } };

type Listener = (event: ScannerEvent) => void;

interface PendingRequest {
  id: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_BRIDGE_URL = 'ws://localhost:9876/ws';

function bridgeUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL;
  if (!fromEnv) return DEFAULT_BRIDGE_URL;
  // Accept a host-only value (e.g. "ws://localhost:9876") and normalize to /ws
  return fromEnv.endsWith('/ws') ? fromEnv : `${fromEnv.replace(/\/$/, '')}/ws`;
}

export class BiometricScannerClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<string, PendingRequest>();
  private status: BridgeStatus | null = null;
  private manualClose = false;
  private requestCounter = 0;
  private readonly token = process.env.NEXT_PUBLIC_BIOMETRIC_BRIDGE_TOKEN ?? '';

  constructor(url?: string) {
    this.url = url ?? bridgeUrl();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentStatus(): BridgeStatus | null {
    return this.status;
  }

  connect(): void {
    this.manualClose = false;

    if (this.isConnected) return;
    if (typeof window === 'undefined') return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit({ type: 'status', data: this.getFallbackStatus(true) });
      // Authenticate with the bridge token when required, then pull status.
      this.sendRaw({ id: this.nextId(), type: 'hello', token: this.token || undefined });
      this.request('get-status').catch(() => undefined);
    };

    this.ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data as string) as ScannerEvent;
        this.ingest(event);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.emit({ type: 'state', state: 'disconnected' });
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire and handle reconnection
    };
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
    this.status = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Send a command to the bridge and await its correlated response.
   */
  request<T = unknown>(
    type: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Biometric bridge is not connected'));
        return;
      }
      const id = this.nextId();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge request "${type}" timed out`));
      }, timeoutMs);

      this.pending.set(id, {
        id,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
      this.sendRaw({ id, type, ...params });
    });
  }

  async connectScanner(): Promise<BridgeStatus> {
    return this.request<BridgeStatus>('connect');
  }

  async disconnectScanner(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('disconnect');
  }

  async detect(): Promise<BridgeDevice[]> {
    return this.request<BridgeDevice[]>('detect');
  }

  async capture(timeoutMs?: number, quality?: number): Promise<CapturedData> {
    return this.request<CapturedData>('capture', {
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(quality !== undefined ? { quality } : {}),
    });
  }

  async enroll(samples = 3, quality?: number): Promise<EnrollResult> {
    return this.request<EnrollResult>('enroll', {
      samples,
      ...(quality !== undefined ? { quality } : {}),
    });
  }

  async verify(referenceTemplate?: { templatePayload: string; format: string } | null): Promise<MatchResult> {
    return this.request<MatchResult>('verify', {
      ...(referenceTemplate ? { referenceTemplate } : {}),
    });
  }

  async identify(): Promise<MatchResult> {
    return this.request<MatchResult>('identify', {});
  }

  async startCapture(timeoutMs?: number, quality?: number): Promise<{ started: boolean }> {
    return this.request<{ started: boolean }>('start-capture', {
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(quality !== undefined ? { quality } : {}),
    });
  }

  async stopCapture(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('stop-capture');
  }

  async refresh(): Promise<BridgeStatus> {
    return this.request<BridgeStatus>('get-status');
  }

  private ingest(event: ScannerEvent): void {
    if (event.type === 'status') {
      this.status = event.data;
    } else if (event.type === 'response') {
      if (!event.id) return;
      const pending = this.pending.get(event.id);
      if (!pending) return;
      this.pending.delete(event.id);
      clearTimeout(pending.timeout);
      if (event.ok) {
        pending.resolve(event.data);
      } else {
        pending.reject(new Error(event.error?.message ?? 'Bridge request failed'));
      }
      return; // responses are not forwarded as events to avoid duplicate handling
    }
    this.emit(event);
  }

  private sendRaw(msg: unknown): void {
    if (this.isConnected) {
      this.ws?.send(JSON.stringify(msg));
    }
  }

  private emit(event: ScannerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private nextId(): string {
    this.requestCounter++;
    return `mv-${Date.now()}-${this.requestCounter}`;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.manualClose = true;
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private getFallbackStatus(connected: boolean): BridgeStatus {
    return {
      connected,
      ready: connected,
      scannerName: null,
      scannerId: null,
      adapterId: null,
      firmwareVersion: null,
      deviceCount: 0,
      devices: [],
      error: connected ? null : 'No fingerprint scanner detected.',
    };
  }
}

// ─── Singleton instance for the app ───────────────────────────────────────────
export const biometricScanner = new BiometricScannerClient();