/**
 * @medivault/mfs100-sdk
 *
 * Native wrapper around the Mantra Softech MFS100.dll fingerprint SDK.
 * Used by the biometric bridge (capture + template extraction) and the
 * backend matcher provider (1:1 / 1:N template comparison).
 *
 * SECURITY:
 *  - raw fingerprint images are memory-only and are zeroed immediately
 *  - only ISO/ANSI minutiae templates (never images) cross application APIs
 *  - nothing in this package logs fingerprint payloads
 */
export { MFS100Sdk, MFS100SdkError, errorMessage, MFS100ErrorCode } from './sdk';
export { findMfs100Dll } from './native-sdk';
export {
  ENCRYPTED_PAYLOAD_PREFIX,
  constantTimeEqual,
  decryptPayload,
  deriveKey,
  encryptPayload,
  isEncryptedPayload,
  signBridgePayload,
  verifyBridgeSignature,
} from './payload';
export {
  DEFAULT_MFS100_MATCH_THRESHOLD,
  DEFAULT_MFS100_TEMPLATE_FORMAT,
  MFS100TemplateFormat,
} from './types';
export type {
  MFS100Capture,
  MFS100DeviceInfo,
  MFS100MatchResult,
  MFS100SdkStatus,
  MFS100Template,
} from './types';

/** Template format identifier strings understood end-to-end by Medivault. */
export const MFS100_FORMAT_LABELS: Record<number, string> = {
  0: 'ANSI_378',
  1: 'ISO_19794_2',
  2: 'ISO_19794_2_2007',
  3: 'FUTRONIC_16',
  4: 'FUTRONIC_32',
};
