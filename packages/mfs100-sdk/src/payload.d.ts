/** Prefix that marks a bridge-encrypted payload. */
export declare const ENCRYPTED_PAYLOAD_PREFIX = "MV1:";
export declare function deriveKey(secret: string): Buffer;
/**
 * Encrypt a template payload (base64 template bytes) so it can be relayed
 * through the browser without ever exposing the template itself.
 *
 * @returns "MV1:<base64(iv:authTag:ciphertext)>"
 */
export declare function encryptPayload(templatePayload: string, encryptionKey: string): string;
/**
 * Decrypt a payload produced by encryptPayload. Returns the base64 template
 * bytes string (or raw input when it was never encrypted).
 *
 * Throws when the key is invalid or the payload is corrupt.
 */
export declare function decryptPayload(opaquePayload: string, encryptionKey?: string | null): string;
/** True when the payload is a bridge-encrypted one. */
export declare function isEncryptedPayload(payload: string): boolean;
/**
 * HMAC-SHA256 signature over the transport payload plus non-secret metadata.
 * Lets the backend authenticate that the capture genuinely came through a
 * trusted local bridge (anti-tamper / anti-replay window is the capturedAt
 * field enforced by the backend).
 */
export declare function signBridgePayload(fields: {
    opaquePayload: string;
    format: string;
    deviceId: string;
    capturedAt: string;
}, bridgeSecret: string): string;
/** Constant-time verification of a bridge signature. */
export declare function verifyBridgeSignature(fields: {
    opaquePayload: string;
    format: string;
    deviceId: string;
    capturedAt: string;
}, expected: string, bridgeSecret: string): boolean;
/**
 * Constant-time equality check for bearer tokens (avoids timing attacks).
 */
export declare function constantTimeEqual(a: string, b: string): boolean;
//# sourceMappingURL=payload.d.ts.map