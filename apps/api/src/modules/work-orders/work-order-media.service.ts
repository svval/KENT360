import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  Permission,
  WORK_ORDER_MEDIA_LIMITS,
  WORK_ORDER_MEDIA_TYPE_LABELS,
  type WorkOrderMediaItem,
  type WorkOrderMediaType,
  type WorkOrderStatus,
} from '@kent360/shared-types';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type ImageKind } from '../storage/image-signature';
import { ImageUploadService, type UploadedFile } from '../storage/image-upload.service';
import { StorageService } from '../storage/storage.service';
import { type ActorContext, MEDIA_UPLOAD_STATUSES, WorkOrdersService } from './work-orders.service';

/**
 * Object key from server-side ids only (no client input, no traversal, no overwrite):
 * municipalities/{mid}/work-orders/{workOrderId}/{before|during|after}/{uuid}.{ext}
 */
export function workOrderMediaKey(
  municipalityId: string,
  workOrderId: string,
  type: WorkOrderMediaType,
  kind: ImageKind,
  uuid = randomUUID(),
): string {
  return `municipalities/${municipalityId}/work-orders/${workOrderId}/${type.toLowerCase()}/${uuid}.${kind.extension}`;
}

/**
 * Evidence photos (BEFORE / DURING / AFTER). Same pipeline as request photos
 * (ImageUploadService → normalizeImage → private bucket → presigned URLs), same limits.
 * Only the people doing the work add photos, and only while the work is going on:
 * after completion nothing can be added or changed (also enforced by a DB trigger).
 */
@Injectable()
export class WorkOrderMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly uploads: ImageUploadService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async upload(
    ctx: ActorContext,
    workOrderId: string,
    type: WorkOrderMediaType,
    files: UploadedFile[],
    meta: RequestMeta,
  ): Promise<WorkOrderMediaItem[]> {
    const { actor } = ctx;
    if (files.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Yüklenecek fotoğraf seçilmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const workOrder = await this.workOrders.findVisible(ctx, workOrderId, {
      status: true,
      assignedUserId: true,
      fieldTeamId: true,
    });
    if (
      !actor.permissions.has(Permission.WORK_ORDERS_EXECUTE) ||
      !this.workOrders.isExecutor(ctx, workOrder)
    ) {
      throw new AppException(
        ErrorCode.NOT_WORK_ORDER_EXECUTOR,
        'Fotoğrafları yalnızca işe atanan personel veya ekip ekleyebilir.',
        HttpStatus.FORBIDDEN,
      );
    }
    this.assertTypeAllowed(type, workOrder.status);
    const existing = await this.prisma.workOrderMedia.count({ where: { workOrderId, type } });
    this.assertLimit(existing, files.length);

    const rows = await this.uploads.store(
      files,
      WORK_ORDER_MEDIA_LIMITS.maxBytes,
      (kind) => workOrderMediaKey(actor.municipalityId, workOrderId, type, kind),
      (images) => {
        const now = new Date();
        return this.prisma.forTenant(actor.municipalityId).$transaction(async (tx) => {
          // Lock the work order and re-check: a completion or cancellation that happened
          // meanwhile wins, and the limit cannot be exceeded by parallel uploads.
          const [locked] = await tx.$queryRaw<{ status: WorkOrderStatus }[]>`
            SELECT status FROM work_orders
            WHERE id = ${workOrderId}::uuid AND municipality_id = ${actor.municipalityId}::uuid
            FOR UPDATE`;
          this.assertTypeAllowed(type, locked.status);
          this.assertLimit(
            await tx.workOrderMedia.count({ where: { workOrderId, type } }),
            images.length,
          );
          const created = await tx.workOrderMedia.createManyAndReturn({
            data: images.map((image) => ({
              workOrderId,
              type,
              storageKey: image.key,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              uploadedById: actor.id,
              createdAt: now,
            })),
            select: {
              id: true,
              type: true,
              storageKey: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          });
          const label = WORK_ORDER_MEDIA_TYPE_LABELS[type];
          await tx.workOrderHistory.create({
            data: {
              workOrderId,
              eventType: 'MEDIA_ADDED',
              description:
                created.length === 1
                  ? `Fotoğraf eklendi (${label}).`
                  : `${created.length} fotoğraf eklendi (${label}).`,
              metadata: { type, mediaIds: created.map((m) => m.id) },
              performedById: actor.id,
              createdAt: now,
            },
          });
          await this.audit.record(
            {
              action: AuditAction.WORK_ORDER_MEDIA_ADDED,
              entityType: 'WorkOrder',
              entityId: workOrderId,
              municipalityId: actor.municipalityId,
              userId: actor.id,
              after: {
                type,
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
      },
    );
    return Promise.all(
      rows.map(async (row) => {
        const signed = await this.storage.presignedUrl(row.storageKey);
        return {
          id: row.id,
          type: row.type,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt.toISOString(),
          url: signed.url,
          urlExpiresAt: signed.expiresAt.toISOString(),
        };
      }),
    );
  }

  /** A fresh short-lived URL for one photo (after the same access check as the work order). */
  async url(
    ctx: ActorContext,
    workOrderId: string,
    mediaId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    await this.workOrders.findVisible(ctx, workOrderId, { id: true });
    const media = await this.prisma.workOrderMedia.findFirst({
      where: { id: mediaId, workOrderId },
      select: { storageKey: true },
    });
    if (!media) throw AppException.notFound(ErrorCode.MEDIA_NOT_FOUND, 'Fotoğraf bulunamadı.');
    const signed = await this.storage.presignedUrl(media.storageKey);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  private assertTypeAllowed(type: WorkOrderMediaType, status: WorkOrderStatus): void {
    if (!MEDIA_UPLOAD_STATUSES[type].includes(status)) {
      throw AppException.conflict(
        ErrorCode.MEDIA_TYPE_NOT_ALLOWED,
        `"${WORK_ORDER_MEDIA_TYPE_LABELS[type]}" fotoğrafı iş emrinin bu aşamasında eklenemez.`,
        { type, status },
      );
    }
  }

  private assertLimit(existing: number, adding: number): void {
    if (existing + adding > WORK_ORDER_MEDIA_LIMITS.maxPerType) {
      throw AppException.conflict(
        ErrorCode.MEDIA_LIMIT_REACHED,
        `Her fotoğraf türünden en fazla ${WORK_ORDER_MEDIA_LIMITS.maxPerType} fotoğraf eklenebilir.`,
        { current: existing, limit: WORK_ORDER_MEDIA_LIMITS.maxPerType },
      );
    }
  }
}
