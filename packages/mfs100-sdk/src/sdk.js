"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MFS100ErrorCode = exports.errorMessage = exports.MFS100SdkError = exports.MFS100Sdk = void 0;
/**
 * High-level MFS100 SDK facade.
 *
 * One instance per process. Used by:
 *   - the biometric bridge  (capture fingerprints, extract templates)
 *   - the backend matcher   (match capture templates against enrolled ones)
 *
 * All methods return real SDK results obtained through FFI. No simulated data.
 */
const native_sdk_1 = require("./native-sdk");
const errors_1 = require("./errors");
Object.defineProperty(exports, "MFS100ErrorCode", { enumerable: true, get: function () { return errors_1.MFS100ErrorCode; } });
Object.defineProperty(exports, "errorMessage", { enumerable: true, get: function () { return errors_1.errorMessage; } });
const types_1 = require("./types");
Object.defineProperty(exports, "MFS100SdkError", { enumerable: true, get: function () { return types_1.MFS100SdkError; } });
function decodeCaptureData(buffer) {
    if (!buffer || buffer.length < 8)
        return { quality: 0, nfiq: 0 };
    return {
        quality: buffer.readInt32LE(0) || 0,
        nfiq: buffer.readInt32LE(4) || 0,
    };
}
class MFS100Sdk {
    static instance = null;
    /** Slot used for all MFS100 API calls. */
    slot = 0;
    license = '';
    initialized = false;
    bootstrapped = false;
    constructor() {
        // read licence at construction time so setLicense() is easy to call before init
        this.license = process.env.MFS100_LICENSE_KEY ?? '';
    }
    static getInstance() {
        if (!MFS100Sdk.instance)
            MFS100Sdk.instance = new MFS100Sdk();
        return MFS100Sdk.instance;
    }
    /** Configure the SDK license before initialize() (MFS100_LICENSE_KEY by default). */
    setLicense(licenseData) {
        this.license = licenseData;
    }
    get dllPath() {
        return native_sdk_1.resolvedDllPath ?? (0, native_sdk_1.findMfs100Dll)();
    }
    get requiresNativeSdk() {
        return true;
    }
    /** Report exactly why the SDK cannot run (driver vs. SDK vs. platform). */
    getStatus() {
        const platformSupported = process.platform === 'win32';
        let ffiAvailable = false;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            ffiAvailable = !!require('koffi');
        }
        catch {
            ffiAvailable = false;
        }
        const dllAvailable = !!this.dllPath;
        let sdkLoadable = false;
        let failureCode = null;
        if (!platformSupported)
            failureCode = errors_1.MFS100ErrorCode.WRAPPER_PLATFORM_UNSUPPORTED;
        else if (!ffiAvailable)
            failureCode = errors_1.MFS100ErrorCode.WRAPPER_FFI_UNAVAILABLE;
        else if (!dllAvailable)
            failureCode = errors_1.MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND;
        else {
            try {
                (0, native_sdk_1.loadSdk)();
                sdkLoadable = true;
            }
            catch (err) {
                failureCode =
                    err instanceof types_1.MFS100SdkError
                        ? err.code
                        : errors_1.MFS100ErrorCode.WRAPPER_SDK_VERSION_UNSUPPORTED;
            }
        }
        return {
            platformSupported,
            ffiAvailable,
            dllAvailable,
            sdkLoadable,
            deviceConnected: sdkLoadable ? this.isDeviceConnected() : false,
            failureCode,
            dllPath: this.dllPath,
            sdkVersion: this.getVersion(),
        };
    }
    getVersion() {
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            if (!sdk.getVersionInfo)
                return '';
            const buf = Buffer.alloc(128);
            const ret = sdk.getVersionInfo(buf);
            if (ret !== 0)
                return '';
            return buf.toString('ascii').replace(/\0.*$/, '').trim();
        }
        catch {
            return '';
        }
    }
    /** Initialize the SDK; open the device once it is available. */
    async initialize(opts) {
        const sdk = (0, native_sdk_1.loadSdk)();
        const license = opts?.license ?? this.license;
        if (this.initialized && !opts?.force)
            return;
        if (license && license.trim()) {
            const setData = sdk.setLicenseData(license.trim());
            if (setData !== 0 && setData !== -110) {
                // -110 == already set is tolerated; anything else is fatal
                throw new types_1.MFS100SdkError(setData, (0, errors_1.errorMessage)(setData));
            }
        }
        const initCode = sdk.init();
        if (initCode !== 0) {
            // Not fatal if "already initialized"
            if (initCode !== errors_1.MFS100ErrorCode.E_ALREADY_INITIALIZED) {
                throw new types_1.MFS100SdkError(initCode, (0, errors_1.errorMessage)(initCode));
            }
        }
        this.initialized = true;
        void this.openDevice();
    }
    ensureInitialized() {
        if (!this.initialized) {
            throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.E_NOT_INITIALIZED, 'MFS100 SDK is not initialized. Call initialize() first.');
        }
    }
    /** Open the device handle. Idempotent. */
    async openDevice() {
        const sdk = (0, native_sdk_1.loadSdk)();
        this.ensureInitialized();
        const ret = sdk.openDevice(this.slot, 1);
        if (ret !== 0 && ret !== errors_1.MFS100ErrorCode.E_ALREADY_INITIALIZED) {
            throw new types_1.MFS100SdkError(ret, (0, errors_1.errorMessage)(ret) + ' Is the scanner connected via USB?');
        }
    }
    async closeDevice() {
        if (!this.initialized)
            return;
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            sdk.closeDevice(this.slot);
        }
        catch {
            // ignore — closing an already-closed device is fine
        }
    }
    /** Is the sensor physically connected and usable right now? */
    isDeviceConnected() {
        if (!this.initialized)
            return false;
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            const ret = sdk.checkFinger(this.slot);
            // 0 means device present; negative codes mean the device is absent
            return ret === 0 || ret > 0;
        }
        catch {
            return false;
        }
    }
    async getDeviceInfo() {
        const sdk = (0, native_sdk_1.loadSdk)();
        this.ensureInitialized();
        await this.openDevice().catch(() => undefined);
        const buffer = Buffer.alloc(native_sdk_1.DEVICE_INFO_BUFFER_SIZE);
        const ret = sdk.getDeviceInfo(this.slot, buffer);
        if (ret !== 0) {
            throw new types_1.MFS100SdkError(ret, (0, errors_1.errorMessage)(ret));
        }
        const info = (0, native_sdk_1.decodeDeviceInfo)(buffer);
        info.connected = info.connected || this.isDeviceConnected();
        return info;
    }
    /**
     * Capture a live fingerprint.
     *
     * @param timeoutMs maximum time to wait for a finger
     * @param minQuality minimum quality (0-100) required before SDK returns
     * @returns transient raw image + quality metadata
     */
    async capture(timeoutMs = 10000, minQuality = 40) {
        const sdk = (0, native_sdk_1.loadSdk)();
        this.ensureInitialized();
        await this.openDevice();
        const imageBuffer = Buffer.alloc(native_sdk_1.MAX_RAW_IMAGE_SIZE);
        const captureDataBuffer = Buffer.alloc(16);
        const deviceInfoBuffer = Buffer.alloc(native_sdk_1.DEVICE_INFO_BUFFER_SIZE);
        return new Promise((resolve, reject) => {
            let settled = false;
            const capturedAt = new Date().toISOString();
            const fail = (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                try {
                    sdk.stopCapture(this.slot);
                }
                catch {
                    // stopCapture can fail after timeout — ignore
                }
                reject(err instanceof Error ? err : new Error(String(err)));
            };
            const timer = setTimeout(() => {
                if (!settled) {
                    fail(new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.E_FW_TIMEOUT, (0, errors_1.errorMessage)(errors_1.MFS100ErrorCode.E_FW_TIMEOUT)));
                }
            }, timeoutMs + 2000);
            const captureCallback = (_ctx, _devInfo, img, size, data) => {
                if (settled)
                    return;
                clearTimeout(timer);
                try {
                    sdk.stopCapture(this.slot);
                }
                catch {
                    // ignore
                }
                if (!img || size <= 0) {
                    fail(new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.E_CAPTURE_FAILED, 'MFS100 returned an empty capture'));
                    return;
                }
                const copy = Buffer.from(img.subarray(0, size));
                const meta = decodeCaptureData(data);
                const info = (0, native_sdk_1.decodeDeviceInfo)(deviceInfoBuffer);
                settled = true;
                resolve({
                    rawImage: copy,
                    width: info.width || 0,
                    height: info.height || 0,
                    quality: meta.quality || 0,
                    nfiq: meta.nfiq > 0 ? meta.nfiq : null,
                    capturedAt,
                });
            };
            const ret = sdk.startCapture(this.slot, timeoutMs, minQuality, captureCallback);
            if (ret !== 0) {
                fail(new types_1.MFS100SdkError(ret, (0, errors_1.errorMessage)(ret)));
            }
        });
    }
    /** Finger currently resting on the sensor? */
    checkFinger() {
        if (!this.initialized)
            return false;
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            return sdk.checkFinger(this.slot) === 0;
        }
        catch {
            return false;
        }
    }
    /** Stop any active capture. Safe to call any time. */
    stopCapture() {
        if (!this.initialized)
            return;
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            sdk.stopCapture(this.slot);
        }
        catch {
            // ignore
        }
    }
    /**
     * Create an ISO/ANSI minutiae template from a captured raw image.
     *
     * @param rawImage raw image returned by capture()
     * @param quality minimum quality to enforce (0 disables)
     * @param format template format
     */
    async createTemplate(rawImage, quality = 0, format = types_1.DEFAULT_MFS100_TEMPLATE_FORMAT) {
        const sdk = (0, native_sdk_1.loadSdk)();
        this.ensureInitialized();
        const templateBuffer = Buffer.alloc(native_sdk_1.MAX_TEMPLATE_SIZE);
        const sizeBuffer = Buffer.alloc(4);
        const duplicateScoreBuffer = Buffer.alloc(4);
        const ret = sdk.createTemplate(this.slot, rawImage, rawImage.length, quality, templateBuffer, sizeBuffer, format, 0, // do not check duplicates against previously enrolled
        40, // duplicate threshold (unused when checking disabled)
        duplicateScoreBuffer);
        if (ret < 0) {
            throw new types_1.MFS100SdkError(ret, (0, errors_1.errorMessage)(ret));
        }
        let size = sizeBuffer.readUInt32LE(0);
        if (size <= 0)
            size = ret; // some SDK builds return the size directly
        if (size <= 0 || size > native_sdk_1.MAX_TEMPLATE_SIZE) {
            throw new types_1.MFS100SdkError(errors_1.MFS100ErrorCode.E_EXTRACTION_FAILED, 'Template extraction returned an invalid template size');
        }
        return {
            template: Buffer.from(templateBuffer.subarray(0, size)),
            format,
            size,
            quality: ret >= 0 && ret <= 100 ? ret : quality,
        };
    }
    /** Convenience: capture a finger and immediately extract a template. */
    async captureAndCreateTemplate(timeoutMs = 10000, minQuality = 40) {
        const cap = await this.capture(timeoutMs, minQuality);
        const templ = await this.createTemplate(cap.rawImage, minQuality);
        // raw fingerprint image is dropped here — never persisted
        cap.rawImage.fill(0);
        return templ;
    }
    /**
     * Compare two templates.
     *
     * @returns score and match boolean (threshold 0-100000, default 14000).
     */
    async matchTemplates(templateA, templateB, threshold = types_1.DEFAULT_MFS100_MATCH_THRESHOLD) {
        const sdk = (0, native_sdk_1.loadSdk)();
        this.ensureInitialized();
        const scoreBuffer = Buffer.alloc(4);
        const ret = sdk.matchTemplate(this.slot, templateA, templateA.length, templateB, templateB.length, scoreBuffer);
        if (ret < 0) {
            throw new types_1.MFS100SdkError(ret, (0, errors_1.errorMessage)(ret));
        }
        let score = scoreBuffer.readInt32LE(0);
        if (score === 0 && ret > 0)
            score = ret; // some SDK builds return the score directly
        return { matched: score >= threshold, score };
    }
    /** Release the SDK and device. */
    async shutdown() {
        if (!this.initialized)
            return;
        await this.closeDevice();
        try {
            const sdk = (0, native_sdk_1.loadSdk)();
            sdk.finalize();
        }
        catch {
            // ignore
        }
        this.initialized = false;
    }
}
exports.MFS100Sdk = MFS100Sdk;
//# sourceMappingURL=sdk.js.map