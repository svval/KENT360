import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, REQUEST_MEDIA_LIMITS, type RequestMediaItem } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { type ImageKind } from '../storage/image-signature';
import { normalizeImage } from '../storage/image-normalizer';
import { RequestsService } from './requests.service';

/** What multer hands over (memory storage). The client's `originalname` is never used. */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Object key: server-generated from ids only, so no client input can influence the path
 * (no traversal, no overwrite): municipalities/{mid}/requests/{requestId}/{uuid}.{ext}
 * The extension comes from the verified file signature, not from the upload.
 */
export function mediaObjectKey(
  municipalityId: string,
  requestId: string,
  kind: ImageKind,
  uuid = randomUUID(),
): string {
  return `municipalities/${municipalityId}/requests/${requestId}/${uuid}.${kind.extension}`;
}

@Injectable()
export class RequestMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly requests: RequestsService,
  ) {}

  /**
   * Validates and normalises every file (signature, size, dimensions, decode, re-encode
   * without metadata – see image-normalizer.ts), stores them in the private
   * bucket, then records them with the timeline entry and audit record in one
   * transaction. If that transaction fails, the uploaded objects are removed again.
   */
  async upload(
    actor: AuthUser,
    requestId: string,
    files: UploadedFile[],
    meta: RequestMeta,
  ): Promise<RequestMediaItem[]> {
    if (files.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Yüklenecek fotoğraf seçilmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const request = await this.requests.findVisible(actor, requestId, {
      id: true,
      status: true,
      createdById: true,
      _count: { select: { media: true } },
    });
    if (!this.requests.canAddMedia(actor, request)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Bu talebe fotoğraf ekleyemezsiniz.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (request._count.media + files.length > REQUEST_MEDIA_LIMITS.maxPerRequest) {
      throw AppException.conflict(
        ErrorCode.MEDIA_LIMIT_REACHED,
        `Bir talebe en fazla ${REQUEST_MEDIA_LIMITS.maxPerRequest} fotoğraf eklenebilir.`,
        { current: request._count.media, limit: REQUEST_MEDIA_LIMITS.maxPerRequest },
      );
    }

    // Every file is validated and re-encoded before anything is stored (no metadata kept).
    const verified: { image: Awaited<ReturnType<typeof normalizeImage>>; key: string }[] = [];
    for (const [index, file] of files.entries()) {
      if (
        file.size > REQUEST_MEDIA_LIMITS.maxBytes ||
        file.buffer.length > REQUEST_MEDIA_LIMITS.maxBytes
      ) {
        throw new AppException(
          ErrorCode.PAYLOAD_TOO_LARGE,
          'Fotoğraf en fazla 10 MB olabilir.',
          HttpStatus.PAYLOAD_TOO_LARGE,
          { index },
        );
      }
      const image = await normalizeImage(file.buffer, file.mimetype, index);
      verified.push({ image, key: mediaObjectKey(actor.municipalityId, requestId, image.kind) });
    }

    const stored: string[] = [];
    try {
      for (const item of verified) {
        await this.storage.put(item.key, item.image.buffer, item.image.kind.mimeType);
        stored.push(item.key);
      }
      const now = new Date();
      const rows = await this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
        const created = await tx.requestMedia.createManyAndReturn({
          data: verified.map((item) => ({
            requestId,
            storageKey: item.key,
            mimeType: item.image.kind.mimeType,
            sizeBytes: item.image.buffer.length,
            uploadedById: actor.id,
            createdAt: now,
          })),
          select: { id: true, storageKey: true, mimeType: true, sizeBytes: true, createdAt: true },
        });
        await this.requests.history(
          tx,
          requestId,
          actor,
          'MEDIA_ADDED',
          created.length === 1 ? 'Fotoğraf eklendi.' : `${created.length} fotoğraf eklendi.`,
          now,
          { metadata: { mediaIds: created.map((m) => m.id) } },
        );
        await this.audit.record(
          {
            action: AuditAction.REQUEST_MEDIA_ADDED,
            entityType: 'Request',
            entityId: requestId,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: {
              media: created.map((m) => ({
                id: m.id,
                mimeType: m.mimeType,
                sizeBytes: m.sizeBytes,
              })),
            },
            meta,
          },
          tx,
        );
        return created;
      });
      return Promise.all(
        rows.map(async (row) => {
          const signed = await this.storage.presignedUrl(row.storageKey);
          return {
            id: row.id,
            mimeType: row.mimeType,
            sizeBytes: row.sizeBytes,
            createdAt: row.createdAt.toISOString(),
            url: signed.url,
            urlExpiresAt: signed.expiresAt.toISOString(),
          };
        }),
      );
    } catch (error) {
      await Promise.all(stored.map((key) => this.storage.delete(key)));
      throw error;
    }
  }

  /** A fresh short-lived URL for one photo (after the same access check as the request). */
  async url(
    actor: AuthUser,
    requestId: string,
    mediaId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    await this.requests.findVisible(actor, requestId, { id: true });
    const media = await this.prisma.requestMedia.findFirst({
      where: { id: mediaId, requestId },
      select: { storageKey: true },
    });
    if (!media) throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, 'Fotoğraf bulunamadı.');
    const signed = await this.storage.presignedUrl(media.storageKey);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }
}
