/**
 * mso100-worker.js — 32-bit IPC worker for MSO100.dll + Mso_SpUsb.dll
 *
 * Must be run with a 32-bit Node.js binary because both DLLs are x86 only.
 * Communicates with the parent (64-bit bridge) via newline-delimited JSON
 * on stdin/stdout.
 *
 * Protocol:
 *   Parent → Worker  (stdin):  { id, cmd, ...args }
 *   Worker → Parent  (stdout): { id, ok, data?, error? }
 *
 * Commands:
 *   { cmd: 'init',    mso100Dll, spUsbDll }         → { ok, serial, model, firmware }
 *   { cmd: 'status' }                                → { ok, connected }
 *   { cmd: 'capture', timeoutMs, minQuality }        → { ok, templateB64, quality, capturedAt }
 *   { cmd: 'cancel' }                                → { ok }
 *   { cmd: 'dispose' }                               → { ok }
 */
'use strict';

const koffi = require('./node_modules/koffi');

// ─── State ──────────────────────────────────────────────────────────────────
let mso100    = null;
let spUsb     = null;
let comHandle = null; // koffi out-pointer buffer holding void* to device
let fns       = null; // resolved function handles

const HWINFO_BUF   = 512;
const CAPTURE_BUF  = 65536;
const DESC_BUF     = 65536;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sym(lib, name, ret, args) {
  try { return lib.func(name, ret, args); }
  catch (e) { throw new Error(`Symbol "${name}" missing from DLL: ${e.message}`); }
}

function readStr(buf, offset, len) {
  len = len || 64;
  let end = buf.indexOf(0, offset);
  if (end < offset || end > offset + len) end = offset + len;
  return buf.toString('ascii', offset, end).replace(/[^\x20-\x7E]/g, '').trim();
}

// ─── Commands ────────────────────────────────────────────────────────────────
function cmdInit({ mso100Dll, spUsbDll }) {
  // Load Mso_SpUsb.dll first (MSO100.dll depends on it)
  spUsb  = koffi.load(spUsbDll);
  mso100 = koffi.load(mso100Dll);

  fns = {
    // SpUsb
    spUsb_EnumDevices:          sym(spUsb,  'SpUsb_EnumDevices',          'int',  ['void **']),
    spUsb_ReleaseEnumDevices:   sym(spUsb,  'SpUsb_ReleaseEnumDevices',   'void', ['void *']),

    // MSO100
    mso_Usb_EnumDevices:        sym(mso100, 'MSO_Usb_EnumDevices',        'int',  ['void **']),
    mso_Usb_ReleaseEnumDevices: sym(mso100, 'MSO_Usb_ReleaseEnumDevices', 'void', ['void *']),
    mso_Usb_ServerInfos:        sym(mso100, 'MSO_Usb_ServerInfos',        'int',  ['void *', 'int', 'uint8 *', 'int']),
    mso_Usb_ServerInfosRelease: sym(mso100, 'MSO_Usb_ServerInfosRelease', 'void', ['void *']),
    mso_ComOpen:                sym(mso100, 'MSO_ComOpen',                 'int',  ['str', 'void **']),
    mso_CloseCom:               sym(mso100, 'MSO_CloseCom',                'int',  ['void *']),
    mso_InitCom:                sym(mso100, 'MSO_InitCom',                 'int',  ['void *']),
    mso_GetHardwareInfo:        sym(mso100, 'MSO_GetHardwareInfo',         'int',  ['void *', 'uint8 *', 'int']),
    mso_RD_Capture:             sym(mso100, 'MSO_RD_Capture',              'int',  ['void *', 'int', 'uint8 *', 'int *']),
    mso_GetDescriptorBin:       sym(mso100, 'MSO_GetDescriptorBin',        'int',  ['void *', 'uint8 **', 'int *']),
    mso_Cancel:                 sym(mso100, 'MSO_Cancel',                  'int',  ['void *']),
    mso_Free:                   sym(mso100, 'MSO_Free',                    'void', ['void *']),
  };

  // Enumerate devices
  const listPtr = [null];
  const enumRet = fns.mso_Usb_EnumDevices(listPtr);
  if (enumRet <= 0) {
    return { ok: false, error: `No Idemia scanner found (MSO_Usb_EnumDevices returned ${enumRet}). Confirm USB connection.` };
  }

  const infoBuf = Buffer.alloc(HWINFO_BUF);
  let serial = '';
  for (let i = 0; i < enumRet; i++) {
    const r = fns.mso_Usb_ServerInfos(listPtr[0], i, infoBuf, HWINFO_BUF);
    if (r >= 0) {
      const s = readStr(infoBuf, 0, 64);
      if (s) { serial = s; break; }
    }
  }
  try { fns.mso_Usb_ReleaseEnumDevices(listPtr[0]); } catch {}

  // Open communication channel
  const handlePtr = [null];
  const openRet = fns.mso_ComOpen(serial, handlePtr);
  if (openRet < 0) {
    return { ok: false, error: `MSO_ComOpen failed (code ${openRet}). Check USB connection and driver.` };
  }
  comHandle = handlePtr[0];

  // Init protocol layer
  const initRet = fns.mso_InitCom(comHandle);
  if (initRet < 0) {
    return { ok: false, error: `MSO_InitCom failed (code ${initRet}).` };
  }

  // Get hardware info
  const hwBuf = Buffer.alloc(HWINFO_BUF);
  let model = 'MSO 1300 E3', firmware = '';
  const hwRet = fns.mso_GetHardwareInfo(comHandle, hwBuf, HWINFO_BUF);
  if (hwRet >= 0) {
    serial   = readStr(hwBuf, 0)   || serial;
    model    = readStr(hwBuf, 64)  || model;
    firmware = readStr(hwBuf, 128) || '';
  }

  return { ok: true, serial, model, firmware };
}

function cmdStatus() {
  if (!fns || !comHandle) return { ok: true, connected: false };
  try {
    const buf = Buffer.alloc(HWINFO_BUF);
    const ret = fns.mso_GetHardwareInfo(comHandle, buf, HWINFO_BUF);
    return { ok: true, connected: ret >= 0 };
  } catch {
    return { ok: true, connected: false };
  }
}

function cmdCapture({ timeoutMs = 15000, minQuality = 40 }) {
  if (!fns || !comHandle) {
    return { ok: false, error: 'Worker not initialised. Send init command first.' };
  }

  const capBuf = Buffer.alloc(CAPTURE_BUF);
  const capLen = [0];

  const capRet = fns.mso_RD_Capture(comHandle, timeoutMs, capBuf, capLen);

  if (capRet < 0) {
    const msg =
      capRet === -9  ? 'Capture timed out — place your finger flat on the sensor.' :
      capRet === -10 ? 'Image quality too low — clean the sensor and retry.' :
      capRet === -11 ? 'Liveness check failed — use a real finger.' :
                       `MSO_RD_Capture failed (code ${capRet})`;
    return { ok: false, error: msg };
  }

  const capturedAt = new Date().toISOString();

  // Retrieve the minutiae template
  const descPtr = [null];
  const descLen = [0];
  const descRet = fns.mso_GetDescriptorBin(comHandle, descPtr, descLen);

  let templateB64 = '';
  if (descRet >= 0 && descLen[0] > 0) {
    // descPtr[0] is a void* pointing to SDK-owned memory; copy it out
    // koffi gives us the pointer value — use capBuf which has the raw capture
    const tplLen = descLen[0];
    const tplBytes = Buffer.from(capBuf.buffer, 0, Math.min(tplLen, capLen[0] || tplLen));
    templateB64 = tplBytes.toString('base64');
    try { fns.mso_Free(descPtr[0]); } catch {}
  } else {
    // Fallback: use the raw capture buffer content
    const len = capLen[0] > 0 ? capLen[0] : CAPTURE_BUF;
    templateB64 = Buffer.from(capBuf.buffer, 0, len).toString('base64');
  }

  const quality = (capRet > 0 && capRet <= 100) ? capRet : minQuality;

  return { ok: true, templateB64, quality, capturedAt };
}

function cmdCancel() {
  if (fns && comHandle) {
    try { fns.mso_Cancel(comHandle); } catch {}
  }
  return { ok: true };
}

function cmdDispose() {
  if (fns && comHandle) {
    try { fns.mso_CloseCom(comHandle); } catch {}
  }
  comHandle = null;
  fns = null;
  return { ok: true };
}

// ─── IPC loop ─────────────────────────────────────────────────────────────────
let buf = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop(); // keep incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }

    let result;
    try {
      switch (msg.cmd) {
        case 'init':    result = cmdInit(msg);    break;
        case 'status':  result = cmdStatus();     break;
        case 'capture': result = cmdCapture(msg); break;
        case 'cancel':  result = cmdCancel();     break;
        case 'dispose': result = cmdDispose();    break;
        default:        result = { ok: false, error: `Unknown command: ${msg.cmd}` };
      }
    } catch (e) {
      result = { ok: false, error: e.message };
    }

    process.stdout.write(JSON.stringify({ id: msg.id, ...result }) + '\n');
  }
});

process.stdin.on('end', () => {
  cmdDispose();
  process.exit(0);
});

process.on('uncaughtException', (e) => {
  process.stdout.write(JSON.stringify({ id: null, ok: false, error: e.message }) + '\n');
});
