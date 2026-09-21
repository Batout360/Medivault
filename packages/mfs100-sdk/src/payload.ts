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
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/** Prefix that marks a bridge-encrypted payload. */
export const ENCRYPTED_PAYLOAD_PREFIX = 'MV1:';

export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a template payload (base64 template bytes) so it can be relayed
 * through the browser without ever exposing the template itself.
 *
 * @returns "MV1:<base64(iv:authTag:ciphertext)>"
 */
export function encryptPayload(templatePayload: string, encryptionKey: string): string {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error('BIOMETRIC_ENCRYPTION_KEY must be at least 32 characters.');
  }
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(templatePayload, 'base64')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ENCRYPTED_PAYLOAD_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a payload produced by encryptPayload. Returns the base64 template
 * bytes string (or raw input when it was never encrypted).
 *
 * Throws when the key is invalid or the payload is corrupt.
 */
export function decryptPayload(opaquePayload: string, encryptionKey?: string | null): string {
  if (!opaquePayload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
    return opaquePayload; // unencrypted (legacy / non-bridge) payload
  }
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error(
      'Encrypted biometric payload received but BIOMETRIC_ENCRYPTION_KEY is missing.',
    );
  }

  const key = deriveKey(encryptionKey);
  const raw = Buffer.from(opaquePayload.slice(ENCRYPTED_PAYLOAD_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('base64');
}

/** True when the payload is a bridge-encrypted one. */
export function isEncryptedPayload(payload: string): boolean {
  return payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX);
}

/**
 * HMAC-SHA256 signature over the transport payload plus non-secret metadata.
 * Lets the backend authenticate that the capture genuinely came through a
 * trusted local bridge (anti-tamper / anti-replay window is the capturedAt
 * field enforced by the backend).
 */
export function signBridgePayload(
  fields: {
    opaquePayload: string;
    format: string;
    deviceId: string;
    capturedAt: string;
  },
  bridgeSecret: string,
): string {
  if (!bridgeSecret) return '';
  const hmac = createHmac('sha256', bridgeSecret);
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
export function verifyBridgeSignature(
  fields: {
    opaquePayload: string;
    format: string;
    deviceId: string;
    capturedAt: string;
  },
  expected: string,
  bridgeSecret: string,
): boolean {
  if (!bridgeSecret || !expected) return false;
  const actual = Buffer.from(signBridgePayload(fields, bridgeSecret), 'utf8');
  const provided = Buffer.from(expected, 'utf8');
  if (actual.length !== provided.length) return false;
  return timingSafeEqual(actual, provided);
}

/**
 * Constant-time equality check for bearer tokens (avoids timing attacks).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
