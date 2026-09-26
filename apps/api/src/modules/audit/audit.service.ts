import { Injectable } from '@nestjs/common';
import { type AuditAction } from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeAuditPayload } from './audit-sanitizer';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  municipalityId?: string | null;
  /** Acting user; null for anonymous events (e.g. failed login of an unknown account). */
  userId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta;
}

/**
 * Anything with an auditLog delegate: the root client, an interactive transaction, or a
 * tenant-scoped (extended) transaction client.
 */
export interface AuditWriter {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): PromiseLike<unknown>;
  };
}

/**
 * Writes to the append-only audit_logs table (UPDATE/DELETE are rejected by a DB
 * trigger). Payloads are sanitised here, centrally, so no caller can leak a
 * password, hash or token into the audit trail.
 *
 * Pass the transaction client when the audited change runs in a transaction, so the
 * audit row commits or rolls back together with the change it describes.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: AuditWriter = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        municipalityId: entry.municipalityId ?? null,
        userId: entry.userId ?? null,
        beforeData: toJson(entry.before),
        afterData: toJson(entry.after),
        ipAddress: entry.meta?.ipAddress ?? null,
        userAgent: entry.meta?.userAgent ?? null,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeAuditPayload(value) as Prisma.InputJsonValue;
}
