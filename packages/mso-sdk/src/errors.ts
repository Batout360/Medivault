/**
 * Idemia MSO SDK error codes and human-readable messages.
 *
 * The MorphoSmartCST DLL returns negative integer codes for failures.
 * Positive return values indicate success or partial success.
 *
 * The wrapper adds its own codes in the 9xxxx range for environment-level
 * failures (missing DLL, FFI unavailable, unsupported platform, …) that are
 * NOT the SDK's fault.
 */

export enum MSOErrorCode {
  /** No error / success */
  SUCCESS = 0,

  // ── MorphoSmartCST SDK error codes ─────────────────────────────────────────
  E_ALREADY_INITIALIZED = -1,
  E_NOT_INITIALIZED = -2,
  E_NO_DEVICE = -3,
  E_OPEN_FAILED = -4,
  E_CLOSE_FAILED = -5,
  E_CAPTURE_FAILED = -6,
  E_EXTRACTION_FAILED = -7,
  E_MATCHING_FAILED = -8,
  E_TIMEOUT = -9,
  E_POOR_IMAGE_QUALITY = -10,
  E_LIVENESS_FAILED = -11,        // spoof / liveness detection failure
  E_INVALID_PARAM = -12,
  E_MEMORY = -13,
  E_DEVICE_BUSY = -14,
  E_FEATURE_NOT_SUPPORTED = -15,
  E_PERMISSION_DENIED = -16,
  E_LICENSE_INVALID = -17,
  E_LICENSE_EXPIRED = -18,
  E_INTERNAL = -99,

  // ── Wrapper environment codes ─────────────────────────────────────────────
  WRAPPER_PLATFORM_UNSUPPORTED = 90001,
  WRAPPER_FFI_UNAVAILABLE = 90002,
  WRAPPER_DLL_NOT_FOUND = 90003,
  WRAPPER_SDK_NOT_FOUND = 90004,
  WRAPPER_SYMBOL_NOT_FOUND = 90005,
  WRAPPER_CAPTURE_CALLBACK_MISSING = 90006,
  WRAPPER_SDK_VERSION_UNSUPPORTED = 90007,
}

/** Human-readable description for every known SDK / wrapper error code. */
export const MSO_ERROR_MESSAGES: Record<number, string> = {
  [MSOErrorCode.SUCCESS]: 'Success',
  [MSOErrorCode.E_ALREADY_INITIALIZED]: 'SDK already initialized',
  [MSOErrorCode.E_NOT_INITIALIZED]: 'SDK not initialized — call MSO_Init first',
  [MSOErrorCode.E_NO_DEVICE]: 'No Idemia MSO device found — confirm USB connection and driver',
  [MSOErrorCode.E_OPEN_FAILED]: 'Could not open the device',
  [MSOErrorCode.E_CLOSE_FAILED]: 'Could not close the device cleanly',
  [MSOErrorCode.E_CAPTURE_FAILED]: 'Fingerprint capture failed',
  [MSOErrorCode.E_EXTRACTION_FAILED]: 'Template extraction failed',
  [MSOErrorCode.E_MATCHING_FAILED]: 'Template matching failed',
  [MSOErrorCode.E_TIMEOUT]:
    'Capture timed out — place your finger flat on the scanner sensor.',
  [MSOErrorCode.E_POOR_IMAGE_QUALITY]: 'Image quality too low — clean the sensor and retry.',
  [MSOErrorCode.E_LIVENESS_FAILED]:
    'Liveness / spoof detection failed — use a real finger.',
  [MSOErrorCode.E_INVALID_PARAM]: 'Invalid parameter passed to the SDK',
  [MSOErrorCode.E_MEMORY]: 'MSO SDK ran out of memory',
  [MSOErrorCode.E_DEVICE_BUSY]: 'Device is busy — another capture may be in progress',
  [MSOErrorCode.E_FEATURE_NOT_SUPPORTED]: 'Feature not supported by this MSO model or firmware',
  [MSOErrorCode.E_PERMISSION_DENIED]: 'USB permission denied — run with sufficient privileges',
  [MSOErrorCode.E_LICENSE_INVALID]: 'MSO SDK license is invalid or not set (MSO_LICENSE_KEY)',
  [MSOErrorCode.E_LICENSE_EXPIRED]: 'MSO SDK license has expired — contact Idemia',
  [MSOErrorCode.E_INTERNAL]: 'Internal MSO SDK error',

  [MSOErrorCode.WRAPPER_PLATFORM_UNSUPPORTED]:
    'MSO 1300 integration requires Windows x64.',
  [MSOErrorCode.WRAPPER_FFI_UNAVAILABLE]:
    'The FFI runtime (koffi) could not be loaded — run npm install in the workspace.',
  [MSOErrorCode.WRAPPER_DLL_NOT_FOUND]:
    'MorphoSmartCST.dll not found — install the Idemia MSO SDK and point MSO_SDK_DLL at it.',
  [MSOErrorCode.WRAPPER_SDK_NOT_FOUND]:
    'Idemia MSO SDK is not installed or not configured.',
  [MSOErrorCode.WRAPPER_SYMBOL_NOT_FOUND]:
    'A required MSO SDK export is missing — the installed SDK version is incompatible.',
  [MSOErrorCode.WRAPPER_CAPTURE_CALLBACK_MISSING]:
    'MSO SDK did not invoke the capture callback.',
  [MSOErrorCode.WRAPPER_SDK_VERSION_UNSUPPORTED]:
    'The installed MSO SDK exports an unexpected API — update the adapter.',
};

/** Return a friendly message for a code, falling back to a generic one. */
export function errorMessage(code: number): string {
  return MSO_ERROR_MESSAGES[code] ?? `MSO SDK error ${code}`;
}
