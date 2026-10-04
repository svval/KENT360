import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from '../../config/env.validation';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * Object storage over the S3 protocol (MinIO in development, any S3-compatible store in
 * production – ARCHITECTURE §9). The bucket is private: objects are never public and
 * are read only through short-lived presigned URLs issued after an access check.
 * The object key (server-generated) is the source of truth; no URL is stored.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Signs URLs for the browser-facing host (may differ from the internal endpoint). */
  private readonly signer: S3Client;
  readonly bucket: string;
  readonly urlTtlSeconds: number;

  constructor(config: ConfigService<Env, true>) {
    const options = (endpoint: string) =>
      new S3Client({
        endpoint,
        region: config.get('MINIO_REGION', { infer: true }),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get('MINIO_ACCESS_KEY', { infer: true }),
          secretAccessKey: config.get('MINIO_SECRET_KEY', { infer: true }),
        },
        // Only send checksums S3 requires; keeps older S3-compatible servers happy.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    const endpoint = config.get('MINIO_ENDPOINT', { infer: true });
    this.client = options(endpoint);
    this.signer = options(config.get('MINIO_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint);
    this.bucket = config.get('MINIO_BUCKET', { infer: true });
    this.urlTtlSeconds = config.get('MEDIA_URL_TTL_SECONDS', { infer: true });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
          // Rendered inline as an image, never offered as a download with a client name.
          ContentDisposition: 'inline',
        }),
      );
    } catch (error) {
      this.logger.error({ err: error, key }, 'Object upload failed');
      throw new AppException(
        ErrorCode.STORAGE_UNAVAILABLE,
        'Dosya depolama servisine ulaşılamıyor. Lütfen daha sonra tekrar deneyin.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Best effort: used to clean up after a failed database write. */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Orphan object could not be deleted');
    }
  }

  /** Presigned GET, valid for MEDIA_URL_TTL_SECONDS. Signing is local – no network call. */
  async presignedUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.urlTtlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + this.urlTtlSeconds * 1000) };
  }

  /**
   * Readiness probe: the bucket answers within 3 s. Uses the same endpoint the API
   * uploads to (a broken Docker port proxy shows up here as well).
   */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(3000),
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.signer.destroy();
  }
}
