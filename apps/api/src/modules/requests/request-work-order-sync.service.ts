import { Injectable } from '@nestjs/common';
import { AuditAction, RequestStatus } from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type RequestMeta } from '../../common/utils/request-meta';
import { type AuditWriter, AuditService } from '../audit/audit.service';
import { citizenRequestUpdate } from '../notifications/domain/notification-rules';
import { type NotificationDb, NotificationsService } from '../notifications/notifications.service';
import {
  REQUIRED_SYNC_EVENTS,
  requestSyncStep,
  type WorkOrderSyncEvent,
} from './domain/work-order-sync';

/** The (tenant-scoped) transaction of the work order change. */
export type RequestSyncDb = AuditWriter &
  NotificationDb & {
    request: {
      findUnique(args: {
        where: { id: string };
        select: { status: true; publicNumber: true };
      }): PromiseLike<{ status: RequestStatus; publicNumber: string } | null>;
      updateMany(args: {
        where: Prisma.RequestWhereInput;
        data: Prisma.RequestUncheckedUpdateManyInput;
      }): PromiseLike<{ count: number }>;
    };
    requestHistory: {
      create(args: { data: Prisma.RequestHistoryUncheckedCreateInput }): PromiseLike<unknown>;
    };
  };

/**
 * Applies the request side of a work order step (domain/work-order-sync.ts) inside the
 * work order's transaction: request status, citizen-facing timeline entry and audit
 * record commit – or roll back – together with the work order change. This is the only
 * place where work orders move requests; RequestsService never calls work orders.
 */
@Injectable()
export class RequestWorkOrderSync {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(
    tx: RequestSyncDb,
    input: {
      actor: AuthUser;
      requestId: string;
      event: WorkOrderSyncEvent;
      workOrder: { id: string; publicNumber: string };
      at: Date;
      meta: RequestMeta;
    },
  ): Promise<void> {
    const { actor, requestId, event, workOrder, at, meta } = input;
    const request = await tx.request.findUnique({
      where: { id: requestId },
      select: { status: true, publicNumber: true },
    });
    if (!request) return; // the request was removed; the work order stands on its own
    const step = requestSyncStep(event, request.status);
    if (!step) {
      if (!REQUIRED_SYNC_EVENTS.has(event)) return;
      throw AppException.conflict(
        ErrorCode.REQUEST_NOT_READY_FOR_WORK_ORDER,
        'Talebin durumu bu iş emri adımıyla uyumlu değil. Sayfayı yenileyin.',
        { requestStatus: request.status, event },
      );
    }
    // Optimistic: the request row is locked until the transaction ends, and a concurrent
    // change of its status makes this match nothing (→ 409, whole transaction rolls back).
    const { count } = await tx.request.updateMany({
      where: { id: requestId, status: step.from },
      data: {
        status: step.to,
        ...(step.to === RequestStatus.RESOLVED && { resolvedAt: at }),
        ...(event === 'RETURNED' && { resolvedAt: null }),
      },
    });
    if (count !== 1) {
      throw AppException.conflict(
        ErrorCode.CONFLICT,
        'Talep bu sırada başka bir işlemle güncellendi. Sayfayı yenileyin.',
      );
    }
    await tx.requestHistory.create({
      data: {
        requestId,
        eventType: event === 'CREATED' ? 'WORK_ORDER_CREATED' : 'STATUS_CHANGED',
        oldStatus: step.from,
        newStatus: step.to,
        description: step.description,
        metadata: { workOrderId: workOrder.id, workOrderNumber: workOrder.publicNumber, event },
        performedById: actor.id,
        createdAt: at,
      },
    });
    await this.audit.record(
      {
        action: AuditAction.REQUEST_STATUS_CHANGED,
        entityType: 'Request',
        entityId: requestId,
        municipalityId: actor.municipalityId,
        userId: actor.id,
        before: { status: step.from },
        after: { status: step.to, workOrderId: workOrder.id, workOrderEvent: event },
        meta,
      },
      tx,
    );
    // Citizens following the request hear about visible progress, in timeline words.
    if (CITIZEN_EVENTS.has(event)) {
      await this.notifications.notify(tx, {
        municipalityId: actor.municipalityId,
        recipients: await this.notifications.citizenWatchers(tx, requestId),
        actorId: actor.id,
        content: citizenRequestUpdate({
          requestId,
          publicNumber: request.publicNumber,
          description: step.description,
          verified: event === 'VERIFIED',
        }),
        at,
      });
    }
  }
}

/** Work order steps a citizen is told about (returns / cancellations stay internal). */
const CITIZEN_EVENTS: ReadonlySet<WorkOrderSyncEvent> = new Set([
  'CREATED',
  'STARTED',
  'COMPLETED',
  'VERIFIED',
]);
