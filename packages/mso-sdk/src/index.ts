/**
 * @medivault/mso-sdk
 *
 * Native wrapper around the Idemia MorphoSmartCST.dll fingerprint SDK.
 * Supports the Idemia MSO 1300 E3 (and compatible MSO 1300-series) devices.
 *
 * Used by:
 *   - apps/biometric-bridge  (capture + template extraction)
 *   - apps/backend           (1:1 / 1:N template matching)
 *
 * SECURITY:
 *  - Raw fingerprint images are memory-only and zeroed immediately after use.
 *  - Only ISO/ANSI minutiae templates (never images) cross application APIs.
 *  - Nothing in this package logs fingerprint payloads.
 */

export { MSOSdk, MSOSdkError, errorMessage, MSOErrorCode } from './sdk';
export { findMsoDll } from './native-sdk';

// Payload transport helpers (AES-256-GCM envelope + HMAC signature) are
// identical to the mfs100-sdk implementation — import them directly from there
// so the secret/key derivation logic stays in one place.
export {
  ENCRYPTED_PAYLOAD_PREFIX,
  constantTimeEqual,
  decryptPayload,
  deriveKey,
  encryptPayload,
  isEncryptedPayload,
  signBridgePayload,
  verifyBridgeSignature,
} from '../../mfs100-sdk/src/payload';

export {
  DEFAULT_MSO_MATCH_THRESHOLD,
  DEFAULT_MSO_TEMPLATE_FORMAT,
  MSOTemplateFormat,
  MSO_FORMAT_LABELS,
} from './types';

export type {
  MSOCapture,
  MSODeviceInfo,
  MSOMatchResult,
  MSOSdkStatus,
  MSOTemplate,
} from './types';
