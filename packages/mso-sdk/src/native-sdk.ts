/**
 * Low-level FFI bindings for the Idemia MorphoSmartCST.dll C API.
 *
 * This module loads koffi and the vendor DLL and exposes the subset of the
 * MSO SDK that Medivault needs:
 *
 *   - Initialize / finalize
 *   - Device open / close / info
 *   - Live fingerprint capture (raw image, memory-only)
 *   - Template extraction (ISO 19794-2 minutiae template)
 *   - Template matching (1:1 score, 0-100000)
 *
 * SECURITY: raw fingerprint images cross the FFI boundary into a Node Buffer
 * and are discarded immediately after the SDK template is created. They are
 * never written to disk and never logged.
 *
 * The wrapper NEVER fabricates fingerprint data. When the SDK, driver or
 * device are missing it raises MSOSdkError with a stable code.
 */
import * as path from 'path';
import * as fs from 'fs';
import { MSOErrorCode, errorMessage } from './errors';
import { MSODeviceInfo, MSOSdkError } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLib = any;

let libHandle: AnyLib | null = null;
export let resolvedDllPath: string | null = null;

/** Bytes to allocate for MSO_GetDeviceInfo output buffer. */
const DEVICE_INFO_BUFFER_SIZE = 512;
/** Max raw image size (MSO 1300 sensor: 500×500 px, 250K + margin). */
export const MAX_RAW_IMAGE_SIZE = 1_000_000;
/** Max minutiae template size. */
export const MAX_TEMPLATE_SIZE = 65_536;

function loadKoffi(): AnyLib {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const k = require('koffi');
    if (!k) throw new Error('koffi resolved to a falsy value');
    return k;
  } catch (err) {
    throw new MSOSdkError(
      MSOErrorCode.WRAPPER_FFI_UNAVAILABLE,
      `${errorMessage(MSOErrorCode.WRAPPER_FFI_UNAVAILABLE)} (koffi load error: ${
        (err as Error).message ?? String(err)
      })`,
    );
  }
}

/** Search well-known Idemia install locations for MorphoSmartCST.dll. */
export function findMsoDll(): string | null {
  const envDll = process.env.MSO_SDK_DLL;
  if (envDll?.trim()) {
    const trimmed = envDll.trim();
    if (trimmed.toLowerCase().endsWith('.dll') && fs.existsSync(trimmed)) return trimmed;
    const candidate = path.join(trimmed, 'MorphoSmartCST.dll');
    if (fs.existsSync(candidate)) return candidate;
  }

  const envDir = process.env.MSO_SDK_DIR;
  if (envDir?.trim()) {
    const candidate = path.join(envDir.trim(), 'MorphoSmartCST.dll');
    if (fs.existsSync(candidate)) return candidate;
  }

  const candidates = [
    'C:\\Program Files\\Idemia\\MSO SDK\\MorphoSmartCST.dll',
    'C:\\Program Files\\Idemia\\MorphoSmartCST\\MorphoSmartCST.dll',
    'C:\\Program Files\\Morpho\\MorphoSmartCST\\MorphoSmartCST.dll',
    'C:\\Program Files (x86)\\Idemia\\MSO SDK\\MorphoSmartCST.dll',
    'C:\\MORPHO\\MorphoSmartCST.dll',
    path.join(process.cwd(), 'MorphoSmartCST.dll'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function platformSupported(): boolean {
  return process.platform === 'win32';
}

function symbol(lib: AnyLib, name: string, ret: string, args: string[]): AnyLib {
  try {
    return lib.func(name, ret, args);
  } catch {
    throw new MSOSdkError(
      MSOErrorCode.WRAPPER_SYMBOL_NOT_FOUND,
      `${name} is missing from the installed MSO SDK — ${errorMessage(
        MSOErrorCode.WRAPPER_SYMBOL_NOT_FOUND,
      )}`,
    );
  }
}

function readAscii(buf: Buffer, offset: number, length: number): string {
  const end = buf.indexOf(0, offset);
  const safeEnd = end > offset && end < offset + length ? end : offset + length;
  return buf
    .toString('ascii', offset, safeEnd)
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

export function decodeDeviceInfo(buffer: Buffer): MSODeviceInfo {
  const serialNumber   = readAscii(buffer, 0,   64);
  const productName    = readAscii(buffer, 64,  64);
  const manufacturerName = readAscii(buffer, 128, 64);
  const firmwareVersion = readAscii(buffer, 192, 32);
  const hardwareVersion = readAscii(buffer, 224, 32);

  const width      = buffer.readInt32LE(256);
  const height     = buffer.readInt32LE(260);
  const resolution = buffer.readInt32LE(264);
  const connected  = buffer.readInt8(268) !== 0;

  return {
    serialNumber,
    productName,
    manufacturerName,
    firmwareVersion,
    hardwareVersion,
    width:      Number.isNaN(width)      ? 0 : width,
    height:     Number.isNaN(height)     ? 0 : height,
    resolution: Number.isNaN(resolution) ? 0 : resolution,
    connected,
  };
}

export interface ResolvedSdk {
  koffi: AnyLib;
  lib: AnyLib;
  init: AnyLib;
  finalize: AnyLib;
  setLicense: AnyLib;
  openDevice: AnyLib;
  closeDevice: AnyLib;
  getDeviceInfo: AnyLib;
  startCapture: AnyLib;
  stopCapture: AnyLib;
  getImageAndTemplate: AnyLib;
  createTemplate: AnyLib;
  matchTemplate: AnyLib;
  getVersionInfo: AnyLib | null;
}

/**
 * Lazily load (once per process) the koffi + MorphoSmartCST.dll bindings.
 *
 * MSO SDK C function signatures (from the MorphoSmartCST header):
 *
 *   int  MSO_Init(void);
 *   int  MSO_Exit(void);
 *   int  MSO_SetLicenseKey(const char* key);
 *   int  MSO_OpenDevice(int index);
 *   int  MSO_CloseDevice(int index);
 *   int  MSO_GetDeviceInfo(int index, unsigned char* outBuffer, int bufferSize);
 *   int  MSO_StartCapture(int index, int timeoutMs, int minQuality, MSO_CaptureCallback cb);
 *   int  MSO_StopCapture(int index);
 *   int  MSO_GetImageAndTemplate(int index, unsigned char* imageOut, int* imageSize,
 *                                unsigned char* templateOut, int* templateSize, int format,
 *                                int* qualityOut, int* nfiqOut);
 *   int  MSO_CreateTemplate(int index, const unsigned char* image, int imageSize,
 *                           unsigned char* templateOut, int* templateSize,
 *                           int format, int minQuality);
 *   int  MSO_MatchTemplate(const unsigned char* t1, int t1Len,
 *                          const unsigned char* t2, int t2Len, int* scoreOut);
 *   int  MSO_GetVersion(char* versionOut, int bufSize);
 */
export function loadSdk(): ResolvedSdk {
  if (libHandle) return resolveFunctions(libHandle);

  if (!platformSupported()) {
    throw new MSOSdkError(
      MSOErrorCode.WRAPPER_PLATFORM_UNSUPPORTED,
      errorMessage(MSOErrorCode.WRAPPER_PLATFORM_UNSUPPORTED),
    );
  }

  const dllPath = findMsoDll();
  if (!dllPath) {
    throw new MSOSdkError(
      MSOErrorCode.WRAPPER_DLL_NOT_FOUND,
      errorMessage(MSOErrorCode.WRAPPER_DLL_NOT_FOUND),
    );
  }
  resolvedDllPath = dllPath;

  let lib: AnyLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    lib = require('koffi').load(dllPath);
  } catch (err) {
    throw new MSOSdkError(
      MSOErrorCode.WRAPPER_DLL_NOT_FOUND,
      `MorphoSmartCST.dll could not be loaded from "${dllPath}" — ${
        (err as Error).message ?? ''
      } Install the Idemia MSO SDK, or set MSO_SDK_DLL.`,
    );
  }

  libHandle = lib;
  return resolveFunctions(lib);
}

function resolveFunctions(lib: AnyLib): ResolvedSdk {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const koffi = require('koffi') as AnyLib;

  // Capture callback: void cb(int index, int event, void* userData)
  const captureCb = koffi.proto('void MSO_CaptureCallback(int, int, void*)');

  return {
    koffi,
    lib,
    init:           symbol(lib, 'MSO_Init',              'int', []),
    finalize:       symbol(lib, 'MSO_Exit',              'int', []),
    setLicense:     symbol(lib, 'MSO_SetLicenseKey',     'int', ['str']),
    openDevice:     symbol(lib, 'MSO_OpenDevice',        'int', ['int']),
    closeDevice:    symbol(lib, 'MSO_CloseDevice',       'int', ['int']),
    getDeviceInfo:  symbol(lib, 'MSO_GetDeviceInfo',     'int', ['int', 'unsigned char *', 'int']),
    startCapture:   symbol(lib, 'MSO_StartCapture',      'int', ['int', 'int', 'int', captureCb]),
    stopCapture:    symbol(lib, 'MSO_StopCapture',       'int', ['int']),
    // One-shot capture + extraction: fills image buffer + template buffer atomically
    getImageAndTemplate: symbol(lib, 'MSO_GetImageAndTemplate', 'int', [
      'int',            // device index
      'unsigned char *', // image out
      'int *',          // image size out
      'unsigned char *', // template out
      'int *',          // template size out
      'int',            // format
      'int *',          // quality out
      'int *',          // nfiq out
    ]),
    createTemplate: symbol(lib, 'MSO_CreateTemplate', 'int', [
      'int',            // device index
      'unsigned char *', // image in
      'int',            // image size
      'unsigned char *', // template out
      'int *',          // template size out
      'int',            // format
      'int',            // min quality
    ]),
    matchTemplate:  symbol(lib, 'MSO_MatchTemplate', 'int', [
      'unsigned char *', // template 1
      'int',             // template 1 length
      'unsigned char *', // template 2
      'int',             // template 2 length
      'int *',           // score out
    ]),
    getVersionInfo: (() => {
      try {
        return symbol(lib, 'MSO_GetVersion', 'int', ['char *', 'int']);
      } catch {
        return null;
      }
    })(),
  };
}

export { DEVICE_INFO_BUFFER_SIZE, decodeDeviceInfo as _decodeDeviceInfo };
