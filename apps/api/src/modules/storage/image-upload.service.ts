import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { normalizeImage } from './image-normalizer';
import { type ImageKind } from './image-signature';
import { StorageService } from './storage.service';

/** What multer hands over (memory storage). The client's `originalname` is never used. */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredImage {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * The one upload pipeline for every user photo (request photos, work order evidence):
 *   1. every file is size-checked and normalised (signature, dimensions, decode,
 *      orientation, re-encode without metadata – image-normalizer.ts) BEFORE anything
 *      is stored, so one bad file stores nothing;
 *   2. the re-encoded images go to the private bucket under server-generated keys;
 *   3. `record` writes the database rows (one transaction, with history and audit);
 *      if it fails, the uploaded objects are deleted again.
 */
@Injectable()
export class ImageUploadService {
  constructor(private readonly storage: StorageService) {}

  async store<T>(
    files: readonly UploadedFile[],
    maxBytes: number,
    keyFor: (kind: ImageKind) => string,
    record: (images: StoredImage[]) => Promise<T>,
  ): Promise<T> {
    const prepared: { key: string; buffer: Buffer; mimeType: string }[] = [];
    for (const [index, file] of files.entries()) {
      if (file.size > maxBytes || file.buffer.length > maxBytes) {
        throw new AppException(
          ErrorCode.PAYLOAD_TOO_LARGE,
          `Fotoğraf en fazla ${Math.round(maxBytes / 1024 / 1024)} MB olabilir.`,
          HttpStatus.PAYLOAD_TOO_LARGE,
          { index },
        );
      }
      const image = await normalizeImage(file.buffer, file.mimetype, index);
      prepared.push({
        key: keyFor(image.kind),
        buffer: image.buffer,
        mimeType: image.kind.mimeType,
      });
    }

    const stored: string[] = [];
    try {
      for (const item of prepared) {
        await this.storage.put(item.key, item.buffer, item.mimeType);
        stored.push(item.key);
      }
      return await record(
        prepared.map((item) => ({
          key: item.key,
          mimeType: item.mimeType,
          sizeBytes: item.buffer.length,
        })),
      );
    } catch (error) {
      await Promise.all(stored.map((key) => this.storage.delete(key)));
      throw error;
    }
  }
}
