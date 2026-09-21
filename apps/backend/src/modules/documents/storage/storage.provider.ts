import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { createSignedToken, verifySignedToken as verifyToken, DownloadDisposition } from './tokens';

export type { DownloadDisposition };

/**
 * Storage abstraction — swap out LocalStorageProvider for an S3/GridFS provider
 * in production without touching any service logic.
 */
export interface StorageProvider {
  save(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
  ): Promise<{ storageKey: string; checksum: string }>;

  read(storageKey: string): Promise<Buffer>;

  delete(storageKey: string): Promise<void>;

  generateSignedUrl(
    storageKey: string,
    expiresInSeconds: number,
    options?: { disposition?: DownloadDisposition },
  ): Promise<string>;

  /**
   * Verify a signed download token.
   * Returns the storageKey if valid, throws otherwise.
   */
  verifySignedToken(token: string): {
    storageKey: string;
    exp: number;
    disposition: DownloadDisposition;
  };
}

/** Whitelist of file extensions we are willing to persist. */
export const SAFE_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.dcm']);

/** Fallback extension per MIME type when the original filename has none. */
export const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/dicom': '.dcm',
};

/** Pick a safe storage extension, falling back to the MIME's canonical one. */
export function resolveExtension(originalName: string, mimeType: string): string {
  const ext = path.extname(originalName ?? '').toLowerCase();
  if (SAFE_EXTENSIONS.has(ext)) return ext;
  return EXTENSION_BY_MIME[mimeType] ?? '';
}

/** DI token — inject with @Inject(STORAGE_PROVIDER) */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Local filesystem implementation.
 * Suitable for development and single-node deployments.
 * In production, replace with an S3-backed implementation.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;
  /** HMAC signing key derived from STORAGE_SIGNING_SECRET or COOKIE_SECRET */
  private readonly signingKey: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = config.get<string>('STORAGE_LOCAL_PATH', './uploads');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
    this.signingKey =
      config.get<string>('STORAGE_SIGNING_SECRET') ??
      config.get<string>('COOKIE_SECRET', 'insecure-dev-key-change-in-prod');
    if (!config.get<string>('STORAGE_SIGNING_SECRET')) {
      this.logger.warn(
        'STORAGE_SIGNING_SECRET not set — falling back to COOKIE_SECRET for token signing. ' +
          'Set a dedicated STORAGE_SIGNING_SECRET in production.',
      );
    }
  }

  /**
   * Persist a file buffer to disk.
   * Returns a UUID-based storage key and SHA-256 checksum.
   *
   * The persisted name is always a random UUID + a whitelisted extension —
   * the caller's original filename never touches disk, preventing any
   * path-traversal / filename-injection attacks.
   */
  async save(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
  ): Promise<{ storageKey: string; checksum: string }> {
    const ext = resolveExtension(originalName, mimeType);
    const storageKey = `${randomUUID()}${ext}`;
    const filePath = path.join(this.basePath, storageKey);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    await fs.promises.writeFile(filePath, buffer);
    this.logger.debug(`Saved file to ${filePath}`);
    return { storageKey, checksum };
  }

  /**
   * Read a file by its storage key.
   * Uses path.basename() to prevent path-traversal attacks.
   */
  async read(storageKey: string): Promise<Buffer> {
    // Prevent path traversal: strip any directory components
    const safeName = path.basename(storageKey);
    const filePath = path.join(this.basePath, safeName);
    return fs.promises.readFile(filePath);
  }

  /**
   * Remove a file from disk. Logs but does not throw if the file is missing.
   */
  async delete(storageKey: string): Promise<void> {
    const safeName = path.basename(storageKey);
    const filePath = path.join(this.basePath, safeName);
    try {
      await fs.promises.unlink(filePath);
      this.logger.debug(`Deleted file ${filePath}`);
    } catch (e) {
      this.logger.warn(`Could not delete ${filePath}: ${e}`);
    }
  }

  /**
   * Generate a short-lived HMAC-signed download token.
   *
   * In production with AWS S3 / GridFS, this URL form is still valid because
   * it resolves through the same /documents/download/:token endpoint.
   */
  async generateSignedUrl(
    storageKey: string,
    expiresInSeconds: number,
    options?: { disposition?: DownloadDisposition },
  ): Promise<string> {
    // Strip directory separators from the storage key before signing
    const safeKey = path.basename(storageKey);
    const disposition = options?.disposition === 'inline' ? 'inline' : 'attachment';

    const token = createSignedToken(this.signingKey, safeKey, expiresInSeconds, disposition);
    return `/api/v1/documents/download/${token}`;
  }

  /**
   * Verify an HMAC-signed download token.
   * Throws BadRequestException / ForbiddenException on invalid/expired tokens.
   */
  verifySignedToken(token: string): {
    storageKey: string;
    exp: number;
    disposition: DownloadDisposition;
  } {
    const verified = verifyToken(this.signingKey, token);
    // Final safety: strip any path traversal from the resolved key
    return { ...verified, storageKey: path.basename(verified.storageKey) };
  }
}
