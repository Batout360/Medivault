/**
 * Medivault Biometric Bridge — local HTTP + WebSocket service.
 *
 * Bonds with USB fingerprint scanners (Mantra MFS100) and exposes a documented
 * protocol to the Medivault frontend. Binds to 127.0.0.1 only.
 *
 * ENDPOINTS
 *   GET  /health              → { status: "ok", version, bridge }
 *   GET  /scanner/status      → BridgeStatus
 *   POST /scanner/detect      → list of detected USB devices
 *   POST /scanner/connect     → activate best scanner adapter
 *   POST /scanner/disconnect  → dispose active adapter
 *   POST /scanner/capture     → capture one fingerprint (opaque payload)
 *   POST /scanner/enroll      → multi-sample enrollment
 *   POST /scanner/verify      → 1:1 verification (reference may be supplied)
 *   POST /scanner/identify    → 1:N identification (candidates may be supplied)
 *   POST /scanner/stop-capture→ cancel an interactive capture
 *
 * WebSocket endpoint: ws://127.0.0.1:<port>/ws (request/response over JSON).
 *
 * Usage:
 *   npm run dev --workspace=apps/biometric-bridge
 *
 * Configuration is loaded from apps/biometric-bridge/.env when present
 * (see .env.example), then from process.env.
 */
import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { pino, Logger } from 'pino';
import { ScannerRegistry } from './adapters/scanner-registry';
import { ScannerAdapter, ScannerStateEvent } from './adapters/adapter.interface';
import { constantTimeEqual, encryptPayload, signBridgePayload } from '@medivault/mfs100-sdk';
import {
  BRIDGE_ERRORS,
  BRIDGE_HOST,
  BRIDGE_PORT,
  BRIDGE_VERSION,
  BridgeErrorCode,
  BridgeResponse,
  BridgeStatus,
  CaptureBody,
  CapturedData,
  EnrollBody,
  MatchBody,
  WsClientMessage,
  WsServerMessage,
  WsScannerState,
} from './protocols/bridge-protocol';

const log: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

function ok<T>(id: string | undefined, data: T): BridgeResponse<T> {
  return { id, type: 'response', ok: true, data };
}

function fail(id: string | undefined, code: BridgeErrorCode, message: string): BridgeResponse {
  return { id, type: 'response', ok: false, error: { code, message } };
}

export class BiometricBridgeServer {
  private readonly registry = new ScannerRegistry(log);
  private readonly httpServer = createServer((req, res) => void this.handleHttp(req, res));
  private readonly wss = new WebSocketServer({
    server: this.httpServer,
    path: '/ws',
  });
  private readonly clients = new Map<string, WebSocket>();
  private readonly bridgeToken = process.env.BIOMETRIC_BRIDGE_TOKEN ?? '';
  private readonly encryptionKey = process.env.BIOMETRIC_ENCRYPTION_KEY ?? '';
  private readonly bridgeSecret = process.env.BIOMETRIC_BRIDGE_SECRET ?? this.encryptionKey;

  constructor() {
    this.wss.on('connection', (socket) => this.handleWsConnection(socket));
  }

  /** Start listening. Returns the bound port for tests. */
  start(port: number = BRIDGE_PORT): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', reject).listen(port, BRIDGE_HOST, () => {
        const address = this.httpServer.address();
        const bound = typeof address === 'object' && address ? address.port : port;
        log.info(
          { host: BRIDGE_HOST, httpPort: bound, wsPort: bound },
          'Biometric bridge listening',
        );
        void this.initScan();
        resolve(bound);
      });
    });
  }

  async stop(): Promise<void> {
    await this.registry.disposeAll().catch(() => undefined);
    for (const socket of this.clients.values()) {
      socket.close();
    }
    this.clients.clear();
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
  }

  // ─── Startup scan ───────────────────────────────────────────────────────────

  private async initScan(): Promise<void> {
    const devices = await this.registry.detect().catch(() => []);
    log.info({ deviceCount: devices.length }, 'Initial USB scan complete');
    await this.ensureActiveAdapter();
    void this.broadcastStatus();
  }

  private async ensureActiveAdapter(): Promise<ScannerAdapter | null> {
    if (!this.registry.getActive()) {
      try {
        const adapter = await this.registry.initializePreferred();
        this.wireAdapterEvents(adapter);
        return adapter;
      } catch (err) {
        log.warn({ err }, 'No scanner adapter available');
        return null;
      }
    }
    return this.registry.getActive();
  }

  /** Forward scanner state events to all WebSocket clients. */
  private wireAdapterEvents(adapter: ScannerAdapter): void {
    adapter.on('connected', (ev: ScannerStateEvent) =>
      this.broadcastWs({ type: 'state', state: 'connected' }),
    );
    adapter.on('disconnected', () => {
      this.broadcastWs({ type: 'state', state: 'disconnected' });
      void this.broadcastStatus();
    });
    adapter.on('capturing', () => this.broadcastWs({ type: 'state', state: 'capturing' }));
    adapter.on('finger_detected', () =>
      this.broadcastWs({ type: 'state', state: 'finger_detected' }),
    );
    adapter.on('finger_removed', () =>
      this.broadcastWs({ type: 'state', state: 'finger_removed' }),
    );
    adapter.on('poor_quality', (ev: ScannerStateEvent) =>
      this.broadcastWs({ type: 'state', state: 'poor_quality' }),
    );
    adapter.on('captured', (ev: ScannerStateEvent) =>
      this.broadcastWs({ type: 'state', state: 'captured' }),
    );
    adapter.on('capture_failed', (ev: ScannerStateEvent) =>
      this.broadcastWs({ type: 'state', state: 'capture_failed' }),
    );
    adapter.on('match_found', () => this.broadcastWs({ type: 'state', state: 'match_found' }));
    adapter.on('no_match', () => this.broadcastWs({ type: 'state', state: 'no_match' }));
    adapter.on('enrollment_sample', () =>
      this.broadcastWs({ type: 'state', state: 'enrollment_sample' }),
    );
    adapter.on('enrollment_complete', () =>
      this.broadcastWs({ type: 'state', state: 'enrollment_complete' }),
    );
    adapter.on('error', (ev: ScannerStateEvent) =>
      this.broadcastWs({ type: 'state', state: 'error' }),
    );
  }

  // ─── HTTP handling ──────────────────────────────────────────────────────────

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = new URL(req.url ?? '/', `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);

    if (url.pathname === '/health' && method === 'GET') {
      this.json(res, 200, {
        status: 'ok',
        version: BRIDGE_VERSION,
        bridge: {
          adapter: this.registry.getActive()?.id ?? null,
          encryption: Boolean(this.encryptionKey),
          signing: Boolean(this.bridgeSecret),
        },
      });
      return;
    }

    if (!this.authenticated(req)) {
      this.json(res, 401, {
        success: false,
        code: BRIDGE_ERRORS.NOT_AUTHENTICATED,
        message: 'Missing or invalid bridge token',
      });
      return;
    }

    try {
      switch (`${method} ${url.pathname}`) {
        case 'GET /scanner/status':
          this.json(res, 200, await this.getStatus());
          return;
        case 'POST /scanner/detect':
          this.json(res, 200, await this.registry.detect());
          return;
        case 'POST /scanner/connect': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.json(res, 503, {
              success: false,
              code: BRIDGE_ERRORS.NO_DEVICE,
              message: 'No fingerprint scanner available',
            });
            return;
          }
          this.json(res, 200, await this.getStatus());
          return;
        }
        case 'POST /scanner/disconnect':
          await this.registry.disposeAll();
          this.json(res, 200, { success: true });
          return;
        case 'POST /scanner/capture': {
          const body = await this.readBody<CaptureBody>(req);
          const captured = await this.requireAdapterAndCapture(body);
          this.json(res, 200, captured);
          return;
        }
        case 'POST /scanner/enroll': {
          const body = await this.readBody<EnrollBody>(req);
          const adapter = await this.ensureActiveAdapter();
          if (!adapter)
            throw httpError(BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available');
          const result = await adapter.enroll({
            samples: body.samples ?? 3,
            finger: body.finger,
            timeoutMs: body.timeoutMs,
            quality: body.quality ?? 40,
          });
          this.json(res, 200, this.secureEnroll(result));
          return;
        }
        case 'POST /scanner/verify': {
          const body = await this.readBody<MatchBody>(req);
          const adapter = await this.ensureActiveAdapter();
          if (!adapter)
            throw httpError(BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available');
          const result = await adapter.verify(body.referenceTemplate ?? null, {
            timeoutMs: body.timeoutMs,
            quality: body.quality ?? 40,
          });
          this.json(res, 200, {
            matched: result.matched,
            score: result.score,
            patientId: result.patientId,
            ...(result.captured ? { ...this.secureCapture(result.captured) } : {}),
          });
          return;
        }
        case 'POST /scanner/identify': {
          const body = await this.readBody<MatchBody>(req);
          const adapter = await this.ensureActiveAdapter();
          if (!adapter)
            throw httpError(BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available');
          const result = await adapter.identify(body.candidates ?? [], {
            timeoutMs: body.timeoutMs,
            quality: body.quality ?? 40,
          });
          this.json(res, 200, {
            matched: result.matched,
            score: result.score,
            patientId: result.patientId,
            ...(result.captured ? { ...this.secureCapture(result.captured) } : {}),
          });
          return;
        }
        case 'POST /scanner/stop-capture': {
          const adapter = this.registry.getActive();
          if (adapter) await adapter.stopCapture().catch(() => undefined);
          this.json(res, 200, { success: true });
          return;
        }
        default:
          this.json(res, 404, {
            success: false,
            code: BRIDGE_ERRORS.NOT_FOUND,
            message: `Unknown route ${method} ${url.pathname}`,
          });
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'INTERNAL';
      const message = err instanceof Error ? err.message : 'Bridge error';
      this.json(res, err instanceof HttpError ? err.status : 500, {
        success: false,
        code,
        message,
      });
    }
  }

  private authenticated(req: IncomingMessage): boolean {
    if (!this.bridgeToken) return true;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    return constantTimeEqual(token, this.bridgeToken);
  }

  private readBody<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          reject(new Error('Request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(
            (chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') : {}) as T,
          );
        } catch {
          reject(httpError(BRIDGE_ERRORS.INVALID_MESSAGE, 'Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  private needEncryption(adapter: ScannerAdapter | null): boolean {
    // Production adapters must never leak plain templates; every capture from
    // a real scanner is relayed as an encrypted, signed payload.
    return adapter !== null;
  }

  private requireAdapterAndCapture(body: CaptureBody): Promise<CapturedData> {
    const run = async (): Promise<CapturedData> => {
      const adapter = await this.ensureActiveAdapter();
      if (!adapter) throw httpError(BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available');
      const template = await adapter.captureFingerprint({
        timeoutMs: body.timeoutMs,
        quality: body.quality ?? 40,
      });
      return this.secureCapture(template, adapter);
    };
    return run();
  }

  /** Wrap a captured template in a secure, signed, opaque payload. */
  private secureCapture(
    template: {
      templatePayload: string;
      format: string;
      quality: number;
      nfiq?: number;
      deviceId: string;
      capturedAt: string;
    },
    adapter: ScannerAdapter | null = this.registry.getActive(),
  ): CapturedData {
    let opaque = template.templatePayload;
    if (this.needEncryption(adapter) && !this.encryptionKey) {
      throw httpError(
        BRIDGE_ERRORS.SDK_MISSING,
        'BIOMETRIC_ENCRYPTION_KEY must be configured for real scanners.',
      );
    }
    if (this.encryptionKey) {
      opaque = encryptPayload(template.templatePayload, this.encryptionKey);
    }
    const bridgeSignature = this.bridgeSecret
      ? signBridgePayload(
          {
            opaquePayload: opaque,
            format: template.format,
            deviceId: template.deviceId,
            capturedAt: template.capturedAt,
          },
          this.bridgeSecret,
        )
      : undefined;

    return {
      templatePayload: opaque,
      format: template.format,
      quality: template.quality,
      nfiq: template.nfiq,
      deviceId: template.deviceId,
      capturedAt: template.capturedAt,
      bridgeSignature,
    };
  }

  private secureEnroll(result: {
    success: boolean;
    samplesCollected: number;
    samplesRequired: number;
    quality: number;
    templatePayload?: string;
    format?: string;
    deviceId?: string;
    message?: string;
  }): Record<string, unknown> {
    const secure = { ...result };
    if (secure.templatePayload) {
      const wrapped = this.secureCapture({
        templatePayload: secure.templatePayload as string,
        format: secure.format as string,
        quality: secure.quality,
        deviceId: secure.deviceId as string,
        capturedAt: new Date().toISOString(),
      });
      delete secure.templatePayload;
      return { ...secure, ...wrapped };
    }
    return secure;
  }

  // ─── WebSocket handling ─────────────────────────────────────────────────────

  private handleWsConnection(socket: WebSocket): void {
    let authed = !this.bridgeToken;
    socket.on('message', (raw: Buffer) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsClientMessage;
      } catch {
        this.sendWs(socket, fail(undefined, BRIDGE_ERRORS.INVALID_MESSAGE, 'Invalid JSON'));
        return;
      }

      if (!authed) {
        if (msg.type === 'hello' && constantTimeEqual(msg.token ?? '', this.bridgeToken)) {
          authed = true;
          this.sendWs(socket, { id: msg.id, type: 'hello-accepted' });
          void this.getStatus().then((s) => this.sendWs(socket, { type: 'status', data: s }));
        } else {
          this.sendWs(
            socket,
            fail(msg.id, BRIDGE_ERRORS.NOT_AUTHENTICATED, 'Authentication required'),
          );
        }
        return;
      }

      if (msg.type === 'hello') {
        this.sendWs(socket, { id: msg.id, type: 'hello-accepted' });
        void this.getStatus().then((s) => this.sendWs(socket, { type: 'status', data: s }));
        return;
      }

      void this.handleWsCommand(socket, msg);
    });

    socket.on('close', () => {
      for (const [id, ws] of this.clients) {
        if (ws === socket) this.clients.delete(id);
      }
    });
  }

  private async handleWsCommand(socket: WebSocket, msg: WsClientMessage): Promise<void> {
    try {
      switch (msg.type) {
        case 'get-status':
          this.sendWs(socket, ok(msg.id, await this.getStatus()));
          return;
        case 'detect':
          this.sendWs(socket, ok(msg.id, await this.registry.detect()));
          return;
        case 'connect': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.sendWs(
              socket,
              fail(msg.id, BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available'),
            );
            return;
          }
          this.sendWs(socket, ok(msg.id, await this.getStatus()));
          return;
        }
        case 'disconnect':
          await this.registry.disposeAll();
          this.sendWs(socket, ok(msg.id, { success: true }));
          return;
        case 'capture':
          this.sendWs(socket, ok(msg.id, await this.requireAdapterAndCapture(msg)));
          return;
        case 'start-capture': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.sendWs(
              socket,
              fail(msg.id, BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available'),
            );
            return;
          }
          await adapter.startCapture({
            timeoutMs: msg.timeoutMs,
            quality: msg.quality ?? 40,
          });
          this.sendWs(socket, ok(msg.id, { started: true }));
          return;
        }
        case 'stop-capture': {
          const adapter = this.registry.getActive();
          if (adapter) await adapter.stopCapture().catch(() => undefined);
          this.sendWs(socket, ok(msg.id, { success: true }));
          return;
        }
        case 'enroll': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.sendWs(
              socket,
              fail(msg.id, BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available'),
            );
            return;
          }
          const result = await adapter.enroll({
            samples: msg.samples ?? 3,
            finger: msg.finger,
            timeoutMs: msg.timeoutMs,
            quality: msg.quality ?? 40,
          });
          this.sendWs(socket, ok(msg.id, this.secureEnroll(result)));
          return;
        }
        case 'verify': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.sendWs(
              socket,
              fail(msg.id, BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available'),
            );
            return;
          }
          const result = await adapter.verify(msg.referenceTemplate ?? null, {
            timeoutMs: msg.timeoutMs,
            quality: msg.quality ?? 40,
          });
          this.sendWs(
            socket,
            ok(msg.id, {
              matched: result.matched,
              score: result.score,
              patientId: result.patientId,
              ...(result.captured ? { ...this.secureCapture(result.captured) } : {}),
            }),
          );
          return;
        }
        case 'identify': {
          const adapter = await this.ensureActiveAdapter();
          if (!adapter) {
            this.sendWs(
              socket,
              fail(msg.id, BRIDGE_ERRORS.NO_DEVICE, 'No fingerprint scanner available'),
            );
            return;
          }
          const result = await adapter.identify(msg.candidates ?? [], {
            timeoutMs: msg.timeoutMs,
            quality: msg.quality ?? 40,
          });
          this.sendWs(
            socket,
            ok(msg.id, {
              matched: result.matched,
              score: result.score,
              patientId: result.patientId,
              ...(result.captured ? { ...this.secureCapture(result.captured) } : {}),
            }),
          );
          return;
        }
        default:
          this.sendWs(socket, fail(msg.id, BRIDGE_ERRORS.UNKNOWN_TYPE, 'Unknown message type'));
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? BRIDGE_ERRORS.INTERNAL;
      this.sendWs(
        socket,
        fail(msg.id, code as BridgeErrorCode, err instanceof Error ? err.message : 'Bridge error'),
      );
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  async getStatus(): Promise<BridgeStatus> {
    const adapter = await this.ensureActiveAdapter();
    let connected = false;
    let info: {
      id: string;
      name: string;
      model: string;
      firmwareVersion: string | null;
    } | null = null;

    if (adapter) {
      try {
        connected = await adapter.isConnected();
        info = await adapter.getDeviceInfo();
      } catch {
        connected = false;
      }
    }

    const devices = (await this.registry.detect().catch(() => [])).map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      serialNumber: d.serialNumber,
      deviceName: d.deviceName,
      adapterId: d.adapterId,
    }));

    const adapterMissing = !adapter;
    const error = adapterMissing
      ? devices.length > 0
        ? (this.registry.lastInitError ?? 'Scanner detected but no adapter could be started.')
        : 'No fingerprint scanner detected.'
      : null;

    return {
      connected,
      ready: Boolean(adapter) && connected,
      scannerName: info?.name ?? null,
      scannerId: info?.id ?? null,
      adapterId: adapter?.id ?? null,
      firmwareVersion: info?.firmwareVersion ?? null,
      deviceCount: devices.length,
      devices,
      error,
    };
  }

  private async broadcastStatus(): Promise<void> {
    try {
      const status = await this.getStatus();
      this.broadcastWs({ type: 'status', data: status });
    } catch {
      // ignore: status polling failures are non-fatal
    }
  }

  // ─── Message plumbing ───────────────────────────────────────────────────────

  private broadcastWs(msg: WsServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const socket of this.clients.values()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(raw);
      }
    }
  }

  private sendWs(socket: WebSocket, msg: WsServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const raw = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(raw),
      'Cache-Control': 'no-store',
    });
    res.end(raw);
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function httpError(code: BridgeErrorCode, message: string, status = 500): HttpError {
  return new HttpError(status, code, message);
}

// ─── Startup ──────────────────────────────────────────────────────────────────

const server = new BiometricBridgeServer();

if (require.main === module) {
  server.start().catch((err) => {
    log.error({ err }, 'Bridge failed to start');
    process.exit(1);
  });

  const shutdown = (): void => {
    log.info('Shutting down bridge…');
    server
      .stop()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { HttpError };
export default BiometricBridgeServer;
