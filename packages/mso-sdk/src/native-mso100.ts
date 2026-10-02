/**
 * Low-level FFI bindings for MSO100.dll + Mso_SpUsb.dll.
 *
 * These are the communication libraries bundled with the Idemia L1 RDService
 * (C:\IdemiaL1RdService\RDService\). They expose a direct channel to the
 * MSO 1300 E3 scanner WITHOUT requiring MorphoSmartCST.dll or an active
 * RDService HTTP server. No internet connection or device registration is
 * needed.
 *
 * Architecture:
 *   Mso_SpUsb.dll  — USB transport: enumerate devices, open/close a pipe,
 *                    read/write raw frames to the scanner.
 *   MSO100.dll     — Protocol layer on top of SpUsb: initialise the COM
 *                    channel, send SDK commands, receive ILV responses.
 *                    Exports MSO_RD_Capture which performs a full
 *                    capture + minutiae extraction in one call.
 *
 * Exported functions used:
 *   MSO100.dll:
 *     MSO_InitCom(comHandle)           → int
 *     MSO_ComOpen(serial, &handle)     → int
 *     MSO_CloseCom(handle)             → int
 *     MSO_GetHardwareInfo(h, buf, len) → int
 *     MSO_RD_Capture(h, opts, &out)   → int  ← capture + template
 *     MSO_GetDescriptorBin(h, &out)   → int  ← raw minutiae template bytes
 *     MSO_Cancel(h)                   → int
 *     MSO_Usb_EnumDevices(&list)      → int
 *     MSO_Usb_ReleaseEnumDevices(list)→ void
 *
 *   Mso_SpUsb.dll (used implicitly by MSO100.dll; we enumerate via it):
 *     SpUsb_EnumDevices(&list)         → int
 *     SpUsb_ReleaseEnumDevices(list)   → void
 *     SpUsb_OpenEx(serial, &handle)    → int
 *     SpUsb_Close(handle)              → void
 *
 * SECURITY: raw fingerprint images never leave the native layer — only the
 * binary minutiae template (ISO 19794-2) is returned to JS as a Buffer.
 */
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLib = any;

let mso100Handle: AnyLib | null = null;
let spUsbHandle: AnyLib | null = null;
export let resolvedMso100Path: string | null = null;
export let resolvedSpUsbPath: string | null = null;

// Output buffer sizes
export const HARDWARE_INFO_BUFFER_SIZE = 512;
export const CAPTURE_OUTPUT_BUFFER_SIZE = 65536; // max minutiae template
export const DESCRIPTOR_BUFFER_SIZE = 65536;

// ─── DLL discovery ───────────────────────────────────────────────────────────

const CANDIDATE_DIRS = [
  'C:\\IdemiaL1RdService\\RDService',
  'C:\\IdemiaL1RdService\\RDService\\L1RD_Management_Tool',
  'C:\\Program Files\\Idemia\\MSO SDK',
  'C:\\Program Files (x86)\\Idemia\\MSO SDK',
  path.join(process.cwd(), 'sdk'),
  process.cwd(),
];

function findDll(name: string, envVar?: string): string | null {
  // 1. Explicit env override
  if (envVar) {
    const envVal = process.env[envVar]?.trim();
    if (envVal) {
      if (envVal.toLowerCase().endsWith('.dll') && fs.existsSync(envVal)) return envVal;
      const candidate = path.join(envVal, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 2. Well-known directories
  for (const dir of CANDIDATE_DIRS) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function findMso100Dll(): string | null {
  return findDll('MSO100.dll', 'MSO100_SDK_DLL');
}

export function findSpUsbDll(): string | null {
  return findDll('Mso_SpUsb.dll', 'MSO_SPUSB_DLL');
}

// ─── Koffi loader ────────────────────────────────────────────────────────────

function loadKoffi(): AnyLib {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const k = require('koffi');
    if (!k) throw new Error('koffi resolved to falsy');
    return k;
  } catch (err) {
    throw new Error(
      `FFI runtime (koffi) could not be loaded: ${(err as Error).message}. Run npm install.`,
    );
  }
}

function sym(lib: AnyLib, name: string, ret: string, args: string[]): AnyLib {
  try {
    return lib.func(name, ret, args);
  } catch {
    throw new Error(`Symbol "${name}" not found in DLL — incompatible SDK version.`);
  }
}

// ─── Resolved SDK handle ─────────────────────────────────────────────────────

export interface MSO100Sdk {
  koffi: AnyLib;
  mso100: AnyLib;
  spUsb: AnyLib;

  // SpUsb — USB device enumeration & transport
  spUsb_EnumDevices: AnyLib;
  spUsb_ReleaseEnumDevices: AnyLib;
  spUsb_OpenEx: AnyLib;
  spUsb_Close: AnyLib;
  spUsb_Lock: AnyLib;
  spUsb_UnLock: AnyLib;

  // MSO100 — protocol + capture
  mso_InitCom: AnyLib;
  mso_CloseCom: AnyLib;
  mso_ComOpen: AnyLib;
  mso_GetHardwareInfo: AnyLib;
  mso_RD_Capture: AnyLib;
  mso_GetDescriptorBin: AnyLib;
  mso_GetDescriptorBinValue: AnyLib;
  mso_Cancel: AnyLib;
  mso_Usb_EnumDevices: AnyLib;
  mso_Usb_ReleaseEnumDevices: AnyLib;
  mso_Usb_ServerInfos: AnyLib;
  mso_Usb_ServerInfosRelease: AnyLib;
  mso_Usb_Lock: AnyLib;
  mso_Usb_UnLock: AnyLib;
  mso_Free: AnyLib;
}

/**
 * Lazily load (once per process) both DLLs via koffi.
 * Throws a descriptive Error if either DLL is missing or incompatible.
 */
export function loadMso100Sdk(): MSO100Sdk {
  if (mso100Handle && spUsbHandle) return buildHandle(mso100Handle, spUsbHandle);

  if (process.platform !== 'win32') {
    throw new Error('MSO100 integration requires Windows x64.');
  }

  const koffi = loadKoffi();

  // ── Load Mso_SpUsb.dll first (MSO100.dll depends on it) ──────────────────
  const spUsbPath = findSpUsbDll();
  if (!spUsbPath) {
    throw new Error(
      'Mso_SpUsb.dll not found. Expected at C:\\IdemiaL1RdService\\RDService\\Mso_SpUsb.dll. ' +
        'Set MSO_SPUSB_DLL env var to override.',
    );
  }

  let spUsb: AnyLib;
  try {
    spUsb = koffi.load(spUsbPath);
  } catch (err) {
    throw new Error(
      `Mso_SpUsb.dll could not be loaded from "${spUsbPath}": ${(err as Error).message}`,
    );
  }
  resolvedSpUsbPath = spUsbPath;
  spUsbHandle = spUsb;

  // ── Load MSO100.dll ───────────────────────────────────────────────────────
  const mso100Path = findMso100Dll();
  if (!mso100Path) {
    throw new Error(
      'MSO100.dll not found. Expected at C:\\IdemiaL1RdService\\RDService\\MSO100.dll. ' +
        'Set MSO100_SDK_DLL env var to override.',
    );
  }

  let mso100: AnyLib;
  try {
    mso100 = koffi.load(mso100Path);
  } catch (err) {
    throw new Error(
      `MSO100.dll could not be loaded from "${mso100Path}": ${(err as Error).message}`,
    );
  }
  resolvedMso100Path = mso100Path;
  mso100Handle = mso100;

  return buildHandle(mso100, spUsb);
}

function buildHandle(mso100: AnyLib, spUsb: AnyLib): MSO100Sdk {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const koffi = require('koffi') as AnyLib;

  return {
    koffi,
    mso100,
    spUsb,

    // ── Mso_SpUsb.dll exports ───────────────────────────────────────────────
    // int SpUsb_EnumDevices(void** ppDeviceList)
    spUsb_EnumDevices:        sym(spUsb, 'SpUsb_EnumDevices',        'int',  ['void **']),
    // void SpUsb_ReleaseEnumDevices(void* pDeviceList)
    spUsb_ReleaseEnumDevices: sym(spUsb, 'SpUsb_ReleaseEnumDevices', 'void', ['void *']),
    // int SpUsb_OpenEx(const char* serial, void** ppHandle)
    spUsb_OpenEx:             sym(spUsb, 'SpUsb_OpenEx',             'int',  ['str', 'void **']),
    // void SpUsb_Close(void* handle)
    spUsb_Close:              sym(spUsb, 'SpUsb_Close',              'void', ['void *']),
    // int SpUsb_Lock(void* handle)
    spUsb_Lock:               sym(spUsb, 'SpUsb_Lock',               'int',  ['void *']),
    // int SpUsb_UnLock(void* handle)
    spUsb_UnLock:             sym(spUsb, 'SpUsb_UnLock',             'int',  ['void *']),

    // ── MSO100.dll exports ──────────────────────────────────────────────────
    // int MSO_InitCom(void* comHandle)
    mso_InitCom:              sym(mso100, 'MSO_InitCom',              'int',  ['void *']),
    // int MSO_CloseCom(void* comHandle)
    mso_CloseCom:             sym(mso100, 'MSO_CloseCom',             'int',  ['void *']),
    // int MSO_ComOpen(const char* serial, void** ppHandle)
    mso_ComOpen:              sym(mso100, 'MSO_ComOpen',              'int',  ['str', 'void **']),
    // int MSO_GetHardwareInfo(void* h, unsigned char* buf, int len)
    mso_GetHardwareInfo:      sym(mso100, 'MSO_GetHardwareInfo',      'int',  ['void *', 'unsigned char *', 'int']),
    // int MSO_RD_Capture(void* h, int timeoutMs, unsigned char* outBuf, int* outLen)
    mso_RD_Capture:           sym(mso100, 'MSO_RD_Capture',           'int',  ['void *', 'int', 'unsigned char *', 'int *']),
    // int MSO_GetDescriptorBin(void* h, unsigned char** ppBuf, int* pLen)
    mso_GetDescriptorBin:     sym(mso100, 'MSO_GetDescriptorBin',     'int',  ['void *', 'unsigned char **', 'int *']),
    // int MSO_GetDescriptorBinValue(void* h, int type, unsigned char** ppBuf, int* pLen)
    mso_GetDescriptorBinValue: sym(mso100, 'MSO_GetDescriptorBinValue', 'int', ['void *', 'int', 'unsigned char **', 'int *']),
    // int MSO_Cancel(void* h)
    mso_Cancel:               sym(mso100, 'MSO_Cancel',               'int',  ['void *']),
    // int MSO_Usb_EnumDevices(void** ppList)
    mso_Usb_EnumDevices:      sym(mso100, 'MSO_Usb_EnumDevices',      'int',  ['void **']),
    // void MSO_Usb_ReleaseEnumDevices(void* pList)
    mso_Usb_ReleaseEnumDevices: sym(mso100, 'MSO_Usb_ReleaseEnumDevices', 'void', ['void *']),
    // int MSO_Usb_ServerInfos(void* pList, int idx, unsigned char* buf, int len)
    mso_Usb_ServerInfos:      sym(mso100, 'MSO_Usb_ServerInfos',      'int',  ['void *', 'int', 'unsigned char *', 'int']),
    // void MSO_Usb_ServerInfosRelease(void* pList)
    mso_Usb_ServerInfosRelease: sym(mso100, 'MSO_Usb_ServerInfosRelease', 'void', ['void *']),
    // int MSO_Usb_Lock(void* h)
    mso_Usb_Lock:             sym(mso100, 'MSO_Usb_Lock',             'int',  ['void *']),
    // int MSO_Usb_UnLock(void* h)
    mso_Usb_UnLock:           sym(mso100, 'MSO_Usb_UnLock',           'int',  ['void *']),
    // void MSO_Free(void* ptr)
    mso_Free:                 sym(mso100, 'MSO_Free',                  'void', ['void *']),
  };
}

/** Enumerate connected MSO devices via MSO_Usb_EnumDevices.
 *  Returns an array of serial-number strings. */
export function enumMsoDevices(sdk: MSO100Sdk): string[] {
  const listPtrBuf = Buffer.alloc(8); // pointer-sized
  const ret = sdk.mso_Usb_EnumDevices(listPtrBuf);
  if (ret < 0 || ret === 0) return [];

  const serials: string[] = [];
  const infoBuf = Buffer.alloc(HARDWARE_INFO_BUFFER_SIZE);

  for (let i = 0; i < ret; i++) {
    try {
      const r = sdk.mso_Usb_ServerInfos(listPtrBuf, i, infoBuf, HARDWARE_INFO_BUFFER_SIZE);
      if (r >= 0) {
        const end = infoBuf.indexOf(0);
        const serial = infoBuf.toString('ascii', 0, end > 0 ? end : 64).trim();
        if (serial) serials.push(serial);
      }
    } catch {
      // skip
    }
  }

  try { sdk.mso_Usb_ReleaseEnumDevices(listPtrBuf); } catch { /* ignore */ }
  return serials;
}
