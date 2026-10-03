import { MFS100ErrorCode, errorMessage } from './errors';
import { MFS100Capture, MFS100DeviceInfo, MFS100MatchResult, MFS100SdkError, MFS100SdkStatus, MFS100Template, MFS100TemplateFormat } from './types';
export declare class MFS100Sdk {
    private static instance;
    /** Slot used for all MFS100 API calls. */
    private readonly slot;
    private license;
    private initialized;
    private bootstrapped;
    private constructor();
    static getInstance(): MFS100Sdk;
    /** Configure the SDK license before initialize() (MFS100_LICENSE_KEY by default). */
    setLicense(licenseData: string): void;
    get dllPath(): string | null;
    get requiresNativeSdk(): boolean;
    /** Report exactly why the SDK cannot run (driver vs. SDK vs. platform). */
    getStatus(): MFS100SdkStatus;
    getVersion(): string;
    /** Initialize the SDK; open the device once it is available. */
    initialize(opts?: {
        license?: string;
        force?: boolean;
    }): Promise<void>;
    private ensureInitialized;
    /** Open the device handle. Idempotent. */
    openDevice(): Promise<void>;
    closeDevice(): Promise<void>;
    /** Is the sensor physically connected and usable right now? */
    isDeviceConnected(): boolean;
    getDeviceInfo(): Promise<MFS100DeviceInfo>;
    /**
     * Capture a live fingerprint.
     *
     * @param timeoutMs maximum time to wait for a finger
     * @param minQuality minimum quality (0-100) required before SDK returns
     * @returns transient raw image + quality metadata
     */
    capture(timeoutMs?: number, minQuality?: number): Promise<MFS100Capture>;
    /** Finger currently resting on the sensor? */
    checkFinger(): boolean;
    /** Stop any active capture. Safe to call any time. */
    stopCapture(): void;
    /**
     * Create an ISO/ANSI minutiae template from a captured raw image.
     *
     * @param rawImage raw image returned by capture()
     * @param quality minimum quality to enforce (0 disables)
     * @param format template format
     */
    createTemplate(rawImage: Buffer, quality?: number, format?: MFS100TemplateFormat): Promise<MFS100Template>;
    /** Convenience: capture a finger and immediately extract a template. */
    captureAndCreateTemplate(timeoutMs?: number, minQuality?: number): Promise<MFS100Template>;
    /**
     * Compare two templates.
     *
     * @returns score and match boolean (threshold 0-100000, default 14000).
     */
    matchTemplates(templateA: Buffer, templateB: Buffer, threshold?: number): Promise<MFS100MatchResult>;
    /** Release the SDK and device. */
    shutdown(): Promise<void>;
}
export { MFS100SdkError, errorMessage, MFS100ErrorCode };
//# sourceMappingURL=sdk.d.ts.map