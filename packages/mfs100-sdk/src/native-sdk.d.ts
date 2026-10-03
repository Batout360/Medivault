import { MFS100DeviceInfo } from './types';
type AnyLib = any;
declare let resolvedDllPath: string | null;
declare let sdkVersion: string;
/** Number of bytes to allocate for MFS100_DEVICE_INFO payload. */
declare const DEVICE_INFO_BUFFER_SIZE = 384;
/** Maximum raw image size (MFS100 sensor is ~480x640, plus margin). */
declare const MAX_RAW_IMAGE_SIZE = 1500000;
/** Maximum template size. */
declare const MAX_TEMPLATE_SIZE: number;
/** Search the well-known Mantra install locations for MFS100.dll. */
export declare function findMfs100Dll(): string | null;
declare function decodeDeviceInfo(buffer: Buffer): MFS100DeviceInfo;
/** Interface object exposing the resolved SDK functions. */
export interface ResolvedSdk {
    koffi: AnyLib;
    lib: AnyLib;
    init: AnyLib;
    autoInit: AnyLib;
    finalize: AnyLib;
    setLicenseData: AnyLib;
    setLicenseFile: AnyLib;
    openDevice: AnyLib;
    closeDevice: AnyLib;
    getDeviceInfo: AnyLib;
    startCapture: AnyLib;
    stopCapture: AnyLib;
    checkFinger: AnyLib;
    getFingerPrintImage: AnyLib;
    createTemplate: AnyLib;
    matchTemplate: AnyLib;
    getVersionInfo: AnyLib | null;
}
/** Lazily load (once) the koffi + MFS100.dll bindings. */
export declare function loadSdk(): ResolvedSdk;
export { resolvedDllPath, sdkVersion, DEVICE_INFO_BUFFER_SIZE, MAX_RAW_IMAGE_SIZE, MAX_TEMPLATE_SIZE, decodeDeviceInfo, };
//# sourceMappingURL=native-sdk.d.ts.map