"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENCRYPTED_PAYLOAD_PREFIX = void 0;
exports.deriveKey = deriveKey;
exports.encryptPayload = encryptPayload;
exports.decryptPayload = decryptPayload;
exports.isEncryptedPayload = isEncryptedPayload;
exports.signBridgePayload = signBridgePayload;
exports.verifyBridgeSignature = verifyBridgeSignature;
exports.constantTimeEqual = constantTimeEqual;
/**
 * Secure payload transport helpers shared by the biometric bridge and the
 * backend matcher.
 *
 * The bridge never sends a raw minutiae template to the browser; it returns an
 * opaque AES-256-GCM ciphertext (prefixed "MV1:") together with an HMAC
 * signature. The backend verifies the signature and decrypts before matching.
 *
 * Raw templates therefore only ever exist:
 *   - inside the scanner SDK (native),
 *   - in the biometric bridge process (transient),
 *   - in the NestJS matcher (transient), and
 *   - encrypted at rest in MongoDB.
 */
const crypto_1 = require("crypto");
/** Prefix that marks a bridge-encrypted payload. */
exports.ENCRYPTED_PAYLOAD_PREFIX = 'MV1:';
function deriveKey(secret) {
    return (0, crypto_1.createHash)('sha256').update(secret).digest();
}
/**
 * Encrypt a template payload (base64 template bytes) so it can be relayed
 * through the browser without ever exposing the template itself.
 *
 * @returns "MV1:<base64(iv:authTag:ciphertext)>"
 */
function encryptPayload(templatePayload, encryptionKey) {
    if (!encryptionKey || encryptionKey.length < 32) {
        throw new Error('BIOMETRIC_ENCRYPTION_KEY must be at least 32 characters.');
    }
    const key = deriveKey(encryptionKey);
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(templatePayload, 'base64')),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return exports.ENCRYPTED_PAYLOAD_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}
/**
 * Decrypt a payload produced by encryptPayload. Returns the base64 template
 * bytes string (or raw input when it was never encrypted).
 *
 * Throws when the key is invalid or the payload is corrupt.
 */
function decryptPayload(opaquePayload, encryptionKey) {
    if (!opaquePayload.startsWith(exports.ENCRYPTED_PAYLOAD_PREFIX)) {
        return opaquePayload; // unencrypted (legacy / non-bridge) payload
    }
    if (!encryptionKey || encryptionKey.length < 32) {
        throw new Error('Encrypted biometric payload received but BIOMETRIC_ENCRYPTION_KEY is missing.');
    }
    const key = deriveKey(encryptionKey);
    const raw = Buffer.from(opaquePayload.slice(exports.ENCRYPTED_PAYLOAD_PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('base64');
}
/** True when the payload is a bridge-encrypted one. */
function isEncryptedPayload(payload) {
    return payload.startsWith(exports.ENCRYPTED_PAYLOAD_PREFIX);
}
/**
 * HMAC-SHA256 signature over the transport payload plus non-secret metadata.
 * Lets the backend authenticate that the capture genuinely came through a
 * trusted local bridge (anti-tamper / anti-replay window is the capturedAt
 * field enforced by the backend).
 */
function signBridgePayload(fields, bridgeSecret) {
    if (!bridgeSecret)
        return '';
    const hmac = (0, crypto_1.createHmac)('sha256', bridgeSecret);
    hmac.update(fields.opaquePayload);
    hmac.update('|');
    hmac.update(fields.format);
    hmac.update('|');
    hmac.update(fields.deviceId);
    hmac.update('|');
    hmac.update(fields.capturedAt);
    return hmac.digest('hex');
}
/** Constant-time verification of a bridge signature. */
function verifyBridgeSignature(fields, expected, bridgeSecret) {
    if (!bridgeSecret || !expected)
        return false;
    const actual = Buffer.from(signBridgePayload(fields, bridgeSecret), 'utf8');
    const provided = Buffer.from(expected, 'utf8');
    if (actual.length !== provided.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(actual, provided);
}
/**
 * Constant-time equality check for bearer tokens (avoids timing attacks).
 */
function constantTimeEqual(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(ba, bb);
}
//# sourceMappingURL=payload.js.map