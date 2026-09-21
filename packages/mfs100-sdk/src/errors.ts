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

export enum MFS100ErrorCode {
  /** No error / success */
  SUCCESS = 0,

  // ── Windows MFS100.dll API codes ──────────────────────────────────────
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

  // ── Device/firmware layer codes ───────────────────────────────────────
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

  // ── Wrapper environment codes ─────────────────────────────────────────
  WRAPPER_PLATFORM_UNSUPPORTED = 90001,
  WRAPPER_FFI_UNAVAILABLE = 90002,
  WRAPPER_DLL_NOT_FOUND = 90003,
  WRAPPER_SDK_NOT_FOUND = 90004,
  WRAPPER_SYMBOL_NOT_FOUND = 90005,
  WRAPPER_CAPTURE_CALLBACK_MISSING = 90006,
  WRAPPER_SDK_VERSION_UNSUPPORTED = 90007,
}

/** Human-readable description for every known SDK / wrapper error code. */
export const MFS100_ERROR_MESSAGES: Record<number, string> = {
  [MFS100ErrorCode.SUCCESS]: 'Success',
  [MFS100ErrorCode.E_LOAD_SCANNER_LIBRARY]: 'Error on loading scanner library',
  [MFS100ErrorCode.E_CAPTURE_FAILED]: 'Capturing is timeout or aborted',
  [MFS100ErrorCode.E_EXTRACTION_FAILED]: 'Extraction failed',
  [MFS100ErrorCode.E_NOT_GOOD_IMAGE]: 'Input image is not good enough',
  [MFS100ErrorCode.E_SPOOF_FINGER]: 'Latent finger found',
  [MFS100ErrorCode.E_ALREADY_INITIALIZED]: 'Already initialized',
  [MFS100ErrorCode.E_NO_DEVICE]: 'No device found',
  [MFS100ErrorCode.E_ALREADY_START_STOP]: 'Device already started or already stopped',
  [MFS100ErrorCode.E_NOT_INITIALIZED]: 'Device not initialized',
  [MFS100ErrorCode.E_OTHER_DEVICE_ERROR]: 'Other device related error',
  [MFS100ErrorCode.E_ALREADY_UNINITIALIZED]: 'Already uninitialized',
  [MFS100ErrorCode.E_UNHANDLED_EXCEPTIONS]: 'Unhandled exception',
  [MFS100ErrorCode.E_NO_SERIAL]: 'No serial number in device',
  [MFS100ErrorCode.E_CORRUPT_SERIAL]: 'Serial number corrupted',
  [MFS100ErrorCode.E_INVALID_PARAM]: 'Invalid parameters',
  [MFS100ErrorCode.E_LATENT_FINGER]: 'Latent finger found',
  [MFS100ErrorCode.E_LOAD_FIRMWARE_FAILED]: 'Load firmware failed',
  [MFS100ErrorCode.E_FW_DEVICE_NOT_FOUND]: 'Device not found',
  [MFS100ErrorCode.E_FW_OPEN_FAILED]: 'Could not open the device',
  [MFS100ErrorCode.E_FW_TIMEOUT]:
    'Capture timed out. Ensure the finger is clean, dry and stable on the scanner.',
  [MFS100ErrorCode.E_FW_SYNC_PROBLEM]:
    'USB sync problem detected — the connected device may not be an MFS100.',
  [MFS100ErrorCode.E_FW_UNKNOWN_SENSOR]: 'Unknown sensor — a non-MFS100 device may be connected.',
  [MFS100ErrorCode.E_FW_NO_IMAGE]: 'No image available.',
  [MFS100ErrorCode.E_FW_KEY_NOT_PASSED_OR_INVALID]: 'License key not passed or invalid.',

  [MFS100ErrorCode.WRAPPER_PLATFORM_UNSUPPORTED]:
    'MFS100 integration requires Windows x64/x86 (32-bit runtime).',
  [MFS100ErrorCode.WRAPPER_FFI_UNAVAILABLE]:
    'The FFI runtime (koffi) could not be loaded. Run npm install in the workspace.',
  [MFS100ErrorCode.WRAPPER_DLL_NOT_FOUND]:
    'MFS100.dll not found. Install the Mantra MFS100 driver/SDK and point MFS100_SDK_DLL at it.',
  [MFS100ErrorCode.WRAPPER_SDK_NOT_FOUND]:
    'MFS100 SDK is not installed or was not configured. Install the Mantra MFS100 driver/SDK.',
  [MFS100ErrorCode.WRAPPER_SYMBOL_NOT_FOUND]:
    'A required MFS100 SDK export is missing — the installed SDK version is incompatible.',
  [MFS100ErrorCode.WRAPPER_CAPTURE_CALLBACK_MISSING]: 'MFS100 did not invoke the capture callback.',
  [MFS100ErrorCode.WRAPPER_SDK_VERSION_UNSUPPORTED]:
    'The installed MFS100 SDK version exports an unexpected API. Update the adapter to match the SDK.',
};

/** Return a friendly message for a code, falling back to a generic one. */
export function errorMessage(code: number): string {
  return MFS100_ERROR_MESSAGES[code] ?? `MFS100 SDK error ${code}`;
}
