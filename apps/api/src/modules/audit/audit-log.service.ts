import { HttpStatus, Injectable } from '@nestjs/common';
import { type AuditLogItem, type Paginated } from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, toSkipTake } from '../../common/pagination/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfLocalDay } from '../operations/domain/local-time';
import { shiftDay } from '../reports/domain/report-scope';
import { auditChanges } from './domain/audit-view';
import { type ListAuditLogsQueryDto } from './dto/audit-log.dto';

/**
 * Read side of the append-only audit trail (Phase 13): the caller's municipality only
 * (tenant extension), newest first, with sanitised key/value changes – never the raw
 * JSON, secrets, free-text bodies or user agents.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: ListAuditLogsQueryDto): Promise<Paginated<AuditLogItem>> {
    const { timezone: timeZone } = await this.prisma.municipality.findUniqueOrThrow({
      where: { id: actor.municipalityId },
      select: { timezone: true },
    });
    const day = (key: string) => startOfLocalDay(new Date(`${key}T12:00:00Z`), timeZone);
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new AppException(
        ErrorCode.INVALID_DATE_RANGE,
        'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const words = query.user?.split(/\s+/).filter(Boolean).slice(0, 3) ?? [];
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...((query.dateFrom || query.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: day(query.dateFrom) }),
          ...(query.dateTo && { lt: day(shiftDay(query.dateTo, 1)) }),
        },
      }),
      ...(words.length > 0 && {
        AND: words.map((word) => ({
          user: {
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName: { contains: word, mode: 'insensitive' as const } },
              { email: { contains: word, mode: 'insensitive' as const } },
            ],
          },
        })),
      }),
    };
    const db = this.prisma.forTenant(actor.municipalityId);
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          ipAddress: true,
          beforeData: true,
          afterData: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      db.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.user
          ? {
              id: row.user.id,
              name: `${row.user.firstName} ${row.user.lastName}`,
              email: row.user.email,
            }
          : null,
        ipAddress: row.ipAddress,
        changes: auditChanges(row.beforeData, row.afterData),
      })),
      total,
      query,
    );
  }
}
