import { createHmac, timingSafeEqual } from 'crypto';

export type DownloadDisposition = 'inline' | 'attachment';

/**
 * Short-lived HMAC-signed download tokens shared by every storage provider.
 *
 * Token format (base64url): base64url(JSON payload) + "." + HMAC-SHA256 signature
 *
 * The HMAC prevents:
 *  - Forgery of tokens pointing to arbitrary storageKeys (path traversal)
 *  - SSRF by crafting tokens that resolve to internal paths
 *
 * The download disposition (inline vs attachment) is embedded in the signed
 * payload so a client cannot tamper with whether the file is served inline.
 */
export function createSignedToken(
  signingKey: string,
  storageKey: string,
  expiresInSeconds: number,
  disposition: DownloadDisposition,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      storageKey,
      exp: Date.now() + expiresInSeconds * 1000,
      disposition,
    }),
  ).toString('base64url');

  const signature = createHmac('sha256', signingKey).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

/**
 * Verify an HMAC-signed download token.
 * Throws on malformed/expired/invalid tokens.
 */
export function verifySignedToken(
  signingKey: string,
  token: string,
): { storageKey: string; exp: number; disposition: DownloadDisposition } {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) {
    throw new Error('Malformed download token: missing signature.');
  }

  const payload = token.substring(0, dotIndex);
  const providedSig = token.substring(dotIndex + 1);

  // Constant-time comparison to prevent timing attacks
  const expectedSig = createHmac('sha256', signingKey).update(payload).digest('base64url');

  const sigBuffer = Buffer.from(providedSig);
  const expectedBuffer = Buffer.from(expectedSig);
  const sigsMatch =
    sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer);

  if (!sigsMatch) {
    throw new Error('Invalid download token signature.');
  }

  let parsed: {
    storageKey: string;
    exp: number;
    disposition?: DownloadDisposition;
  };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed download token payload.');
  }

  if (!parsed.storageKey || !parsed.exp) {
    throw new Error('Download token missing required fields.');
  }

  if (Date.now() > parsed.exp) {
    throw new Error('Download token has expired.');
  }

  return {
    storageKey: parsed.storageKey,
    exp: parsed.exp,
    disposition: parsed.disposition === 'inline' ? 'inline' : 'attachment',
  };
}
