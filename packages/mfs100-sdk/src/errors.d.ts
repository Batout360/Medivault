/**
 * MFS100 SDK error codes and human-readable messages.
 *
 * Positive codes (1301+) come from the Windows MFS100.dll C API.
 * Negative codes (‑1000 … ‑1322) come from the device/firmware layer and are
 * reported by newer SDK builds on both Windows and Android.
 *
 * The wrapper adds its own non‑SDK codes in the 9xxxx range for environment
 * problems that are NOT the SDK's fault (missing DLL, missing FFI runtime,
 * unsupported platform, …).
 */
export declare enum MFS100ErrorCode {
    /** No error / success */
    SUCCESS = 0,
    E_LOAD_SCANNER_LIBRARY = 1301,
    E_CAPTURE_FAILED = 1302,
    E_EXTRACTION_FAILED = 1303,
    E_NOT_GOOD_IMAGE = 1304,
    E_SPOOF_FINGER = 1305,
    E_ALREADY_INITIALIZED = 1306,
    E_NO_DEVICE = 1307,
    E_ALREADY_START_STOP = 1308,
    E_NOT_INITIALIZED = 1309,
    E_OTHER_DEVICE_ERROR = 1310,
    E_ALREADY_UNINITIALIZED = 1311,
    E_UNHANDLED_EXCEPTIONS = 1312,
    E_NO_SERIAL = 1313,
    E_CORRUPT_SERIAL = 1314,
    E_INVALID_PARAM = 1315,
    E_LATENT_FINGER = 1316,
    E_LOAD_FIRMWARE_FAILED = 1317,
    E_FW_DEVICE_NOT_FOUND = -1001,
    E_FW_DEVICE_ALREADY_OPEN = -1002,
    E_FW_OPEN_FAILED = -1003,
    E_FW_CLOSE_FAILED = -1004,
    E_FW_TIMEOUT = -1140,
    E_FW_SYNC_PROBLEM = -1139,
    E_FW_UNKNOWN_SENSOR = -1142,
    E_FW_NO_IMAGE = -1123,
    E_FW_PERMISSION_DENIED = -1001,
    E_FW_KEY_NOT_PASSED_OR_INVALID = -1322,
    WRAPPER_PLATFORM_UNSUPPORTED = 90001,
    WRAPPER_FFI_UNAVAILABLE = 90002,
    WRAPPER_DLL_NOT_FOUND = 90003,
    WRAPPER_SDK_NOT_FOUND = 90004,
    WRAPPER_SYMBOL_NOT_FOUND = 90005,
    WRAPPER_CAPTURE_CALLBACK_MISSING = 90006,
    WRAPPER_SDK_VERSION_UNSUPPORTED = 90007
}
/** Human-readable description for every known SDK / wrapper error code. */
export declare const MFS100_ERROR_MESSAGES: Record<number, string>;
/** Return a friendly message for a code, falling back to a generic one. */
export declare function errorMessage(code: number): string;
//# sourceMappingURL=errors.d.ts.map