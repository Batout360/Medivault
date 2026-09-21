import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mongoose, { Connection } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { StorageProvider, resolveExtension, DownloadDisposition } from './storage.provider';
import { createSignedToken, verifySignedToken as verifyToken } from './tokens';

// GridFSBucket from the SAME mongoose-bundled mongodb driver as connection.db,
// so native driver types line up (root `mongodb` is a different version).
const GridFSBucket = mongoose.mongo.GridFSBucket;
type GridFSBucketType = InstanceType<typeof GridFSBucket>;

/**
 * MongoDB GridFS storage backend.
 *
 * Files are stored entirely inside MongoDB (fs.files + fs.chunks collections),
 * so no filesystem state is required wherever the API runs. Large files are
 * chunked (255 KB chunks), which sidesteps MongoDB's 16 MB per-document limit
 * and keeps the existing 50 MB upload cap intact.
 *
 * Selected with STORAGE_PROVIDER=gridfs. Bucket name via
 * STORAGE_GRIDFS_BUCKET (default "uploads").
 */
@Injectable()
export class GridFSStorageProvider implements StorageProvider {
  private readonly logger = new Logger(GridFSStorageProvider.name);
  private readonly bucket: GridFSBucketType;
  private readonly signingKey: string;

  constructor(config: ConfigService, connection: Connection) {
    const bucketName = config.get<string>('STORAGE_GRIDFS_BUCKET', 'uploads');
    const db = connection.db;
    if (!db) {
      throw new Error('Mongoose connection is not ready; cannot initialize GridFS bucket.');
    }
    this.bucket = new GridFSBucket(db, {
      bucketName,
      chunkSizeBytes: 255 * 1024,
    });
    this.signingKey =
      config.get<string>('STORAGE_SIGNING_SECRET') ??
      config.get<string>('COOKIE_SECRET', 'insecure-dev-key-change-in-prod');
  }

  async save(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
  ): Promise<{ storageKey: string; checksum: string }> {
    const ext = resolveExtension(originalName, mimeType);
    const storageKey = `${randomUUID()}${ext}`;

    await new Promise<void>((resolve, reject) => {
      const stream = this.bucket.openUploadStream(storageKey, {
        metadata: { mimeType, originalName },
      });
      stream.once('error', reject);
      stream.once('finish', () => resolve());
      stream.end(buffer);
    });

    const checksum = createHash('sha256').update(buffer).digest('hex');
    this.logger.debug(`Saved ${buffer.length} bytes to GridFS as ${storageKey}`);
    return { storageKey, checksum };
  }

  async read(storageKey: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = this.bucket.openDownloadStreamByName(storageKey);
    try {
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    } catch {
      this.logger.warn(`GridFS read failed for ${storageKey}`);
      throw new Error('File not found in storage.');
    }
    if (chunks.length === 0) {
      throw new Error('File not found in storage.');
    }
    return Buffer.concat(chunks);
  }

  async delete(storageKey: string): Promise<void> {
    let deleted = 0;
    try {
      const cursor = this.bucket.find({ filename: storageKey });
      for await (const file of cursor) {
        await this.bucket.delete(file._id);
        deleted += 1;
      }
    } catch (err: unknown) {
      this.logger.warn(`GridFS delete failed for ${storageKey}: ${String(err)}`);
    }
    if (deleted > 0) {
      this.logger.debug(`Deleted ${deleted} GridFS file(s) for ${storageKey}`);
    }
  }

  async generateSignedUrl(
    storageKey: string,
    expiresInSeconds: number,
    options?: { disposition?: DownloadDisposition },
  ): Promise<string> {
    const disposition = options?.disposition === 'inline' ? 'inline' : 'attachment';
    const token = createSignedToken(this.signingKey, storageKey, expiresInSeconds, disposition);
    return `/api/v1/documents/download/${token}`;
  }

  verifySignedToken(token: string): {
    storageKey: string;
    exp: number;
    disposition: DownloadDisposition;
  } {
    return verifyToken(this.signingKey, token);
  }
}
