import {
  ENCRYPTED_PAYLOAD_PREFIX,
  decryptPayload,
  encryptPayload,
  isEncryptedPayload,
  signBridgePayload,
  verifyBridgeSignature,
} from './payload';

const KEY = 'test-encryption-key-0123456789abcdef-32chars-min';
const SECRET = 'test-bridge-secret';

describe('payload transport (bridge ↔ backend contract)', () => {
  it('encrypts then decrypts a template round-trip', () => {
    const template = Buffer.from('FAKE_MINUTIAE_TEMPLATE').toString('base64');
    const opaque = encryptPayload(template, KEY);

    expect(opaque.startsWith(ENCRYPTED_PAYLOAD_PREFIX)).toBe(true);
    expect(isEncryptedPayload(opaque)).toBe(true);
    expect(opaque).not.toContain('FAKE_MINUTIAE_TEMPLATE');
    expect(decryptPayload(opaque, KEY)).toBe(template);
  });

  it('does not reveal plaintext in the ciphertext', () => {
    const template = Buffer.from('TOP_SECRET_FINGERPRINT').toString('base64');
    const opaque = encryptPayload(template, KEY);
    expect(Buffer.from(opaque, 'utf8').includes(Buffer.from('TOP_SECRET_FINGERPRINT'))).toBe(false);
  });

  it('passes through unencrypted payloads in dev mode', () => {
    expect(decryptPayload('RAW_PLAIN_PAYLOAD', KEY)).toBe('RAW_PLAIN_PAYLOAD');
    expect(isEncryptedPayload('RAW_PLAIN_PAYLOAD')).toBe(false);
  });

  it('throws when the decryption key is too short', () => {
    const template = Buffer.from('XXX').toString('base64');
    const opaque = encryptPayload(template, KEY);
    expect(() => decryptPayload(opaque, 'short')).toThrow(/BIOMETRIC_ENCRYPTION_KEY/i);
  });

  it('signs a payload and verifies it', () => {
    const fields = {
      opaquePayload: 'MV1:aaaaaa',
      format: 'ISO_19794_2',
      deviceId: 'MFS-TEST-001',
      capturedAt: new Date().toISOString(),
    };
    const signature = signBridgePayload(fields, SECRET);
    expect(signature).toHaveLength(64);
    expect(verifyBridgeSignature(fields, signature, SECRET)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const fields = {
      opaquePayload: 'MV1:aaaaaa',
      format: 'ISO_19794_2',
      deviceId: 'MFS-TEST-001',
      capturedAt: new Date().toISOString(),
    };
    const signature = signBridgePayload(fields, SECRET);
    const tampered = { ...fields, deviceId: 'MFS-TEST-002' };
    expect(verifyBridgeSignature(tampered, signature, SECRET)).toBe(false);
  });

  it('returns empty signature without a secret', () => {
    const fields = {
      opaquePayload: 'MV1:aaaaaa',
      format: 'ISO_19794_2',
      deviceId: 'MFS-TEST-001',
      capturedAt: new Date().toISOString(),
    };
    expect(signBridgePayload(fields, '')).toBe('');
  });
});
