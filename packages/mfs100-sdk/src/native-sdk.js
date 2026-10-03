"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TEMPLATE_SIZE = exports.MAX_RAW_IMAGE_SIZE = exports.DEVICE_INFO_BUFFER_SIZE = exports.sdkVersion = exports.resolvedDllPath = void 0;
exports.findMfs100Dll = findMfs100Dll;
exports.loadSdk = loadSdk;
exports.decodeDeviceInfo = decodeDeviceInfo;
/**
 * Low-level FFI bindings for the Mantra Softech MFS100.dll C API (v4+).
 *
 * This module loads <koffi> and the vendor MFS100.dll and exposes the subset
 * of the SDK that Medivault needs:
 *
 *   - Initialize / finalize
 *   - Device detection & enumeration
 *   - Live fingerprint capture (raw image, memory only)
 *   - Template extraction (ISO 19794-2 / ANSI 378 minutiae templates)
 *   - Template matching (1:1 score)
 *
 * SECURITY: raw fingerprint images cross the FFI boundary into a Node Buffer
 * and are discarded immediately after the SDK template is created. They are
 * never written to disk and never logged.
 *
 * The wrapper NEVER fabricates fingerprint data. If the SDK, driver or device
 * are missing it raises MFS100SdkError with a stable code.
 */
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const errors_1 = require("./errors");
const types_1 = require("./types");
/** koffi library handle (never exposed). */
let libHandle = null;
let resolvedDllPath = null;
exports.resolvedDllPath = resolvedDllPath;
let sdkVersion = '';
exports.sdkVersion = sdkVersion;
/** Number of bytes to allocate for MFS100_DEVICE_INFO payload. */
const DEVICE_INFO_BUFFER_SIZE = 384;
exports.DEVICE_INFO_BUFFER_SIZE = DEVICE_INFO_BUFFER_SIZE;
/** Maximum raw image size (MFS100 sensor is ~480x640, plus margin). */
const MAX_RAW_IMAGE_SIZE = 1_500_000;
exports.MAX_RAW_IMAGE_SIZE = MAX_RAW_IMAGE_SIZE;
/** Maximum template size. */
const MAX_TEMPLATE_SIZE = 64 * 1024;
exports.MAX_TEMPLATE_SIZE = MAX_TEMPLATE_SIZE;
function loadKoffi() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const koffi = require('koffi');
        if (!koffi)
            throw new Error('koffi resolved to falsy value');
        return koffi;
    }
    catch (err) {
        throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.WRAPPER_FFI_UNAVAILABLE, `${(0, errors_1.errorMessage)(errors_1.MFS100ErrorCode.WRAPPER_FFI_UNAVAILABLE)} (koffi load error: ${err.message ?? String(err)})`);
    }
}
/** Search the well-known Mantra install locations for MFS100.dll. */
function findMfs100Dll() {
    const envDll = process.env.MFS100_SDK_DLL;
    if (envDll && envDll.trim()) {
        const trimmed = envDll.trim();
        if (trimmed.toLowerCase().endsWith('.dll') && fs.existsSync(trimmed))
            return trimmed;
        const candidate = path.join(trimmed, 'MFS100.dll');
        if (fs.existsSync(candidate))
            return candidate;
    }
    const envDir = process.env.MFS100_SDK_DIR;
    if (envDir && envDir.trim()) {
        const candidate = path.join(envDir.trim(), 'MFS100.dll');
        if (fs.existsSync(candidate))
            return candidate;
    }
    const candidates = [
        'C:\\Program Files\\Mantra\\MFS100\\MFS100.dll',
        'C:\\Program Files (x86)\\Mantra\\MFS100\\MFS100.dll',
        'C:\\Mantra\\MFS100\\MFS100.dll',
        path.join(process.cwd(), 'MFS100.dll'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
/** True when running on a supported Windows build. */
function platformSupported() {
    return process.platform === 'win32' && process.arch === 'x64';
}
/** Resolve a low-level MFS100 function object or throw a symbol error. */
function symbol(lib, name, ret, args) {
    try {
        return lib.func(name, ret, args);
    }
    catch {
        throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.WRAPPER_SYMBOL_NOT_FOUND, `${name} is missing from the installed MFS100 SDK — ${(0, errors_1.errorMessage)(errors_1.MFS100ErrorCode.WRAPPER_SYMBOL_NOT_FOUND)}`);
    }
}
function readAscii(buffer, offset, length) {
    const end = buffer.indexOf(0, offset);
    const safeEnd = end > offset && end < offset + length ? end : offset + length;
    return buffer
        .toString('ascii', offset, safeEnd)
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
}
function decodeDeviceInfo(buffer) {
    const serialNumber = readAscii(buffer, 0, 64);
    const productName = readAscii(buffer, 64, 64);
    const manufacturerName = readAscii(buffer, 128, 64);
    const softwareVersion = readAscii(buffer, 192, 32);
    const embeddedVersion = readAscii(buffer, 224, 32);
    const hardwareVersion = readAscii(buffer, 256, 32);
    const width = buffer.readInt32LE(288);
    const height = buffer.readInt32LE(292);
    const resolution = buffer.readInt32LE(296);
    const datatype = buffer.readInt32LE(300);
    const connected = buffer.readInt8(320) !== 0;
    return {
        serialNumber,
        productName,
        manufacturerName,
        softwareVersion,
        embeddedVersion,
        hardwareVersion,
        width: Number.isNaN(width) ? 0 : width,
        height: Number.isNaN(height) ? 0 : height,
        resolution: Number.isNaN(resolution) ? 0 : resolution,
        datatype: Number.isNaN(datatype) ? 0 : datatype,
        connected,
    };
}
/** Lazily load (once) the koffi + MFS100.dll bindings. */
function loadSdk() {
    if (libHandle)
        return resolveFunctions(libHandle);
    if (!platformSupported()) {
        throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.WRAPPER_PLATFORM_UNSUPPORTED, (0, errors_1.errorMessage)(errors_1.MFS100ErrorCode.WRAPPER_PLATFORM_UNSUPPORTED));
    }
    loadKoffi();
    const dllPath = findMfs100Dll();
    if (!dllPath) {
        throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND, (0, errors_1.errorMessage)(errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND), errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND);
    }
    exports.resolvedDllPath = resolvedDllPath = dllPath;
    let lib;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        lib = require('koffi').load(dllPath);
    }
    catch (err) {
        throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND, `MFS100.dll could not be loaded from "${dllPath}" — ${err.message ?? ''} Install the Mantra MFS100 driver/SDK, or set MFS100_SDK_DLL.`, errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND);
    }
    libHandle = lib;
    return resolveFunctions(lib);
}
/** Resolve every function we use. Missing exports -> WRAPPER_SYMBOL_NOT_FOUND. */
function resolveFunctions(lib) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi');
    // void captureCallback(void* context, MFS100_DEVICE_INFO* devInfo,
    //                      unsigned char* image, unsigned long size,
    //                      MFS100_CAPTURE_DATA* data)
    const captureCb = koffi.proto('void cb(void*, unsigned char*, unsigned char*, unsigned int, unsigned char*)');
    return {
        koffi,
        lib,
        init: symbol(lib, 'MFS100_Init', 'int', []),
        autoInit: symbol(lib, 'MFS100_AutoInit', 'int', []),
        finalize: symbol(lib, 'MFS100_Finalize', 'int', []),
        setLicenseData: symbol(lib, 'MFS100_SetLicenseData', 'int', ['str']),
        setLicenseFile: symbol(lib, 'MFS100_SetLicenseFile', 'int', ['str']),
        openDevice: symbol(lib, 'MFS100_OpenDevice', 'int', ['uint32', 'int']),
        closeDevice: symbol(lib, 'MFS100_CloseDevice', 'int', ['uint32']),
        getDeviceInfo: symbol(lib, 'MFS100_GetDeviceInfo', 'int', ['uint32', 'unsigned char *']),
        startCapture: symbol(lib, 'MFS100_StartCapture', 'int', ['uint32', 'int', 'int', captureCb]),
        stopCapture: symbol(lib, 'MFS100_StopCapture', 'int', ['uint32']),
        checkFinger: symbol(lib, 'MFS100_CheckFinger', 'int', ['uint32']),
        getFingerPrintImage: symbol(lib, 'MFS100_GetFingerPrintImage', 'int', [
            'uint32',
            'unsigned char *',
            'uint32',
            'unsigned char *',
        ]),
        createTemplate: symbol(lib, 'MFS100_CreateTemplate', 'int', [
            'uint32',
            'unsigned char *',
            'uint32',
            'int',
            'unsigned char *',
            'unsigned char *',
            'int',
            'int',
            'int',
            'unsigned char *',
        ]),
        matchTemplate: symbol(lib, 'MFS100_MatchTemplate', 'int', [
            'uint32',
            'unsigned char *',
            'uint32',
            'unsigned char *',
            'uint32',
            'unsigned char *',
        ]),
        getVersionInfo: symbol(lib, 'MFS100_GetVersionInfo', 'int', ['char *']),
    };
}
//# sourceMappingURL=native-sdk.js.map