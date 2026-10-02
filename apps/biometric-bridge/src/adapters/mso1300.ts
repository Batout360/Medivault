/**
 * MSO1300Adapter — Idemia MSO 1300 E3 USB fingerprint scanner.
 *
 * MSO100.dll + Mso_SpUsb.dll are 32-bit (x86) only. Node.js on this machine
 * runs as x64 and cannot load them directly. This adapter spawns a small
 * 32-bit Node.js child process (node32/worker/worker.js) that loads the DLLs
 * and communicates back via newline-delimited JSON on stdin/stdout (IPC).
 *
 * USB identifiers (Windows Device Manager with MorphoSmart USB driver):
 *   VID 0x225D  PID 0x000A  — MSO 1300 E3 (MorphoSmart driver)
 *   VID 0x1DCF  PID 0x0007  — MSO 1300 (legacy Idemia VID)
 *   VID 0x1DCF  PID 0x0004  — MSO 1300 E1/E2 (legacy)
 *
 * Worker binary: apps/biometric-bridge/node32/node-v20.19.4-win-x86/node.exe
 * Worker script: apps/biometric-bridge/node32/worker/worker.js
 */
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  BiometricMatchResult,
  CaptureOptions,
  CapturedTemplate,
  EnrollOptions,
  MatchCandidate,
  ScannerAdapter,
  ScannerDeviceInfo,
} from './adapter.interface';

// ─── USB identifiers ──────────────────────────────────────────────────────────
export const MSO_VID_MORPHO = 0x225d;  // MorphoSmart USB driver VID
export const MSO_VID_IDEMIA = 0x1dcf;  // Legacy Idemia VID
export const MSO_PID_E3     = 0x000a;  // MSO 1300 E3
export const MSO_PID_LEGACY = [0x0007, 0x0004];

const DEFAULT_CAPTURE_TIMEOUT_MS = 15000;
const DEFAULT_MIN_QUALITY = 40;

// ─── Worker IPC ──────────────────────────────────────────────────────────────

interface WorkerResponse {
  id: string | null;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

interface PendingCall {
  resolve: (r: WorkerResponse) => void;
  reject:  (e: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
}

/** Resolve a path relative to the bridge app root (works under tsx, ts-node, or compiled JS). */
function bridgeRoot(): string {
  // __dirname is apps/biometric-bridge/src/adapters in source,
  // or apps/biometric-bridge/dist/.../adapters in compiled output.
  // Walk up until we find package.json to locate the bridge root.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@medivault/biometric-bridge') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: go up 2 levels from src/adapters
  return path.resolve(__dirname, '..', '..');
}

function findNode32(): string {
  const envOverride = process.env.MSO_NODE32_BIN;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;

  const candidate = path.join(bridgeRoot(), 'node32', 'node-v20.19.4-win-x86', 'node.exe');
  if (fs.existsSync(candidate)) return candidate;

  throw new Error(
    `32-bit Node.js not found at "${candidate}". ` +
    'Download it from https://nodejs.org/dist/v20.19.4/node-v20.19.4-win-x86.zip ' +
    'and extract to apps/biometric-bridge/node32/, or set MSO_NODE32_BIN.',
  );
}

function findWorkerScript(): string {
  const envOverride = process.env.MSO_WORKER_SCRIPT;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;

  const candidate = path.join(bridgeRoot(), 'node32', 'worker', 'worker.js');
  if (fs.existsSync(candidate)) return candidate;

  throw new Error(
    `Worker script not found at "${candidate}". ` +
    'Ensure node32/worker/worker.js is present in the bridge directory.',
  );
}

function findMso100Dll(): string {
  const envVal = process.env.MSO100_SDK_DLL?.trim();
  if (envVal && fs.existsSync(envVal)) return envVal;

  const candidates = [
    'C:\\IdemiaL1RdService\\RDService\\MSO100.dll',
    'C:\\IdemiaL1RdService\\RDService\\L1RD_Management_Tool\\MSO100.dll',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('MSO100.dll not found. Set MSO100_SDK_DLL env var.');
}

function findSpUsbDll(): string {
  const envVal = process.env.MSO_SPUSB_DLL?.trim();
  if (envVal && fs.existsSync(envVal)) return envVal;

  const candidates = [
    'C:\\IdemiaL1RdService\\RDService\\Mso_SpUsb.dll',
    'C:\\IdemiaL1RdService\\RDService\\L1RD_Management_Tool\\Mso_SpUsb.dll',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Mso_SpUsb.dll not found. Set MSO_SPUSB_DLL env var.');
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class MSO1300Adapter extends EventEmitter implements ScannerAdapter {
  readonly id   = 'mso1300';
  readonly name = 'Idemia MSO 1300 E3 Fingerprint Scanner';

  private worker:   ChildProcessWithoutNullStreams | null = null;
  private pending:  Map<string, PendingCall> = new Map();
  private lineBuf:  string = '';
  private device:   ScannerDeviceInfo | null = null;
  private busy      = false;
  private callCount = 0;

  // ── VID / PID ─────────────────────────────────────────────────────────────

  get supportedVendorIds(): number[] {
    const override = (process.env.MSO_VENDOR_ID ?? '')
      .split(',').map(v => parseInt(v.trim(), 16)).filter(n => !Number.isNaN(n));
    return override.length ? override : [MSO_VID_MORPHO, MSO_VID_IDEMIA];
  }

  private get knownPids(): number[] {
    const override = (process.env.MSO_PRODUCT_ID ?? '')
      .split(',').map(p => parseInt(p.trim(), 16)).filter(n => !Number.isNaN(n));
    return override.length ? override : [MSO_PID_E3, ...MSO_PID_LEGACY];
  }

  canHandle(vendorId: number, productId: number): boolean {
    return this.supportedVendorIds.includes(vendorId) && this.knownPids.includes(productId);
  }

  // ── Worker management ─────────────────────────────────────────────────────

  private spawnWorker(): void {
    const node32  = findNode32();
    const script  = findWorkerScript();

    this.worker = spawn(node32, [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.worker.stdout.setEncoding('utf8');
    this.worker.stdout.on('data', (chunk: string) => {
      this.lineBuf += chunk;
      const lines = this.lineBuf.split('\n');
      this.lineBuf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as WorkerResponse;
          if (msg.id) {
            const pending = this.pending.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(msg.id);
              pending.resolve(msg);
            }
          }
        } catch { /* ignore malformed */ }
      }
    });

    this.worker.stderr.setEncoding('utf8');
    this.worker.stderr.on('data', (d: string) => {
      // Worker stderr — log but don't crash
      process.stderr.write(`[mso-worker] ${d}`);
    });

    this.worker.on('exit', (code) => {
      this.worker = null;
      // Reject all pending calls
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MSO worker exited (code ${code})`));
      }
      this.pending.clear();
      this.emit('disconnected', { kind: 'disconnected' });
    });
  }

  private call(cmd: Record<string, unknown>, timeoutMs = 30000): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('MSO worker is not running'));
        return;
      }
      const id = `mso-${++this.callCount}-${Date.now()}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MSO worker command "${cmd['cmd']}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.stdin.write(JSON.stringify({ id, ...cmd }) + '\n');
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(deviceInfo?: {
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
  }): Promise<ScannerDeviceInfo> {
    const mso100Dll = findMso100Dll();
    const spUsbDll  = findSpUsbDll();

    this.spawnWorker();

    // Give the worker 1s to start up
    await new Promise(r => setTimeout(r, 1000));

    const res = await this.call({ cmd: 'init', mso100Dll, spUsbDll }, 15000);

    if (!res.ok) {
      this.worker?.kill();
      this.worker = null;
      throw new Error(res.error ?? 'MSO worker init failed');
    }

    this.device = {
      id:               (res['serial'] as string) || deviceInfo?.serialNumber || `MSO1300_${randomUUID().slice(0, 8).toUpperCase()}`,
      name:             this.name,
      manufacturer:     'Idemia',
      model:            (res['model'] as string)    || 'MSO 1300 E3',
      firmwareVersion:  (res['firmware'] as string) || null,
      connectionType:   'usb',
      connected:        true,
      supportedFormats: ['ISO_19794_2'],
    };

    this.emit('connected', { kind: 'connected', model: this.device.model });
    return this.device;
  }

  async getDeviceInfo(): Promise<ScannerDeviceInfo> {
    if (this.device) return this.device;
    return {
      id:               `MSO1300_${randomUUID().slice(0, 8).toUpperCase()}`,
      name:             this.name,
      manufacturer:     'Idemia',
      model:            'MSO 1300 E3',
      firmwareVersion:  null,
      connectionType:   'usb',
      connected:        false,
      supportedFormats: ['ISO_19794_2'],
    };
  }

  async isConnected(): Promise<boolean> {
    if (!this.worker) return false;
    try {
      const res = await this.call({ cmd: 'status' }, 5000);
      return res.ok && (res['connected'] as boolean) === true;
    } catch {
      return false;
    }
  }

  // ── Capture ───────────────────────────────────────────────────────────────

  async startCapture(options?: CaptureOptions): Promise<void> {
    if (this.busy) throw new Error('Scanner is busy');
    this.emit('capturing', { kind: 'capturing' });
    void this.captureFingerprint(options);
  }

  async stopCapture(): Promise<void> {
    if (this.worker) {
      await this.call({ cmd: 'cancel' }, 3000).catch(() => undefined);
    }
    this.busy = false;
    this.emit('finger_removed', { kind: 'finger_removed' });
  }

  async captureFingerprint(options?: CaptureOptions): Promise<CapturedTemplate> {
    if (this.busy && options?.timeoutMs === undefined) {
      throw new Error('Scanner is busy');
    }
    if (!this.worker) {
      throw new Error('MSO scanner is not initialised. Call initialize() first.');
    }

    this.busy = true;
    this.emit('finger_detected', { kind: 'finger_detected' });

    try {
      const timeoutMs  = options?.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
      const minQuality = options?.quality   ?? DEFAULT_MIN_QUALITY;

      const res = await this.call(
        { cmd: 'capture', timeoutMs, minQuality },
        timeoutMs + 5000,
      );

      if (!res.ok) throw new Error(res.error ?? 'Capture failed');

      const quality  = (res['quality'] as number) ?? minQuality;
      const template = res['templateB64'] as string;
      const capturedAt = res['capturedAt'] as string;

      if (!template || template.length === 0) {
        throw new Error('MSO worker returned an empty template');
      }

      if (quality < minQuality) {
        this.emit('poor_quality', { kind: 'poor_quality', quality });
      }

      this.emit('captured', { kind: 'captured', quality });

      const device = await this.getDeviceInfo();

      return {
        templatePayload: template,
        format:          'ISO_19794_2',
        quality,
        deviceId:        device.id,
        capturedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'MSO 1300 capture failed';
      this.emit('capture_failed', { kind: 'capture_failed', error: message });
      throw err;
    } finally {
      this.busy = false;
    }
  }

  // ── Enroll ────────────────────────────────────────────────────────────────

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
    const timeoutMs       = options?.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
    const minQuality      = options?.quality   ?? DEFAULT_MIN_QUALITY;

    const samples: CapturedTemplate[] = [];

    for (let i = 0; i < samplesRequired; i++) {
      this.emit('enrollment_sample', { kind: 'enrollment_sample', sample: i + 1, of: samplesRequired, quality: 0 });
      const sample = await this.captureFingerprint({ timeoutMs, quality: minQuality });
      if (sample.quality < minQuality) {
        throw new Error(`Sample ${i + 1} quality ${sample.quality}% is below minimum ${minQuality}%. Rescan.`);
      }
      samples.push(sample);
      this.emit('enrollment_sample', { kind: 'enrollment_sample', sample: i + 1, of: samplesRequired, quality: sample.quality });
    }

    const best = samples.reduce((a, b) => b.quality > a.quality ? b : a);
    this.emit('enrollment_complete', { kind: 'enrollment_complete', quality: best.quality });

    return {
      success:          true,
      samplesCollected: samples.length,
      samplesRequired,
      quality:          best.quality,
      templatePayload:  best.templatePayload,
      format:           best.format,
      deviceId:         best.deviceId,
      message:          `Enrolled ${samples.length} sample(s) via Idemia MSO 1300 E3.`,
    };
  }

  // ── Verify / Identify ─────────────────────────────────────────────────────
  // MSO100.dll has no match export — backend performs all template comparison.

  async verify(
    referenceTemplate: { templatePayload: string; format: string } | null,
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    return { matched: false, captured };
  }

  async identify(
    candidates: MatchCandidate[],
    options?: CaptureOptions,
  ): Promise<BiometricMatchResult> {
    const captured = await this.captureFingerprint(options);
    return { matched: false, captured };
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    this.busy = false;
    if (this.worker) {
      await this.call({ cmd: 'dispose' }, 3000).catch(() => undefined);
      this.worker.stdin.end();
      this.worker.kill();
      this.worker = null;
    }
    this.device = null;
    this.pending.clear();
  }
}
