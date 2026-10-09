import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@kent360/shared-types';
import { type Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { CLOSED_REQUEST_STATUSES } from '../operations/dashboard.service';
import { slaNotification } from './domain/notification-rules';
import { NotificationsService } from './notifications.service';

const DEFAULT_INTERVAL_MS = 5 * 60_000;
/** Older SLA events are history, not alerts (avoids a flood after downtime or a seed). */
const LOOKBACK_MS = 7 * 86_400_000;
const BATCH = 500;

interface Candidate {
  id: string;
  municipality_id: string;
  department_id: string | null;
  public_number: string;
  title: string;
  kind: 'SLA_AT_RISK' | 'SLA_BREACHED';
}

/**
 * "SLA riskte / aşıldı" notifications for the department managers. SLA states are
 * time-driven, so a light periodic sweep (no queue infrastructure) finds open requests
 * that crossed slaAtRiskAt / slaDueAt and have not been alerted yet. Idempotent: one
 * alert per request and kind (NOT EXISTS on notifications), and a transaction-level
 * advisory lock keeps parallel API instances from sweeping at the same time.
 */
@Injectable()
export class SlaAlertsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SlaAlertsService.name);
  private timer: NodeJS.Timeout | undefined;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    const configured = config.get('SLA_ALERT_INTERVAL_MS', { infer: true });
    const isTest = config.get('NODE_ENV', { infer: true }) === 'test';
    this.intervalMs = configured ?? (isTest ? 0 : DEFAULT_INTERVAL_MS);
  }

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.sweep().catch((error: Error) =>
        this.logger.warn(`SLA alert sweep failed: ${error.name}`),
      );
    }, this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<{ alerts: number; notifications: number }> {
    const since = new Date(now.getTime() - LOOKBACK_MS);
    return this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('kent360.sla_alerts')) AS locked`;
      if (!locked) return { alerts: 0, notifications: 0 };

      const candidates = await tx.$queryRaw<Candidate[]>`
        SELECT r.id, r.municipality_id, r.department_id, r.public_number, r.title,
               CASE WHEN r.sla_due_at <= ${now} THEN 'SLA_BREACHED' ELSE 'SLA_AT_RISK' END AS kind
        FROM requests r
        WHERE r.status::text <> ALL(${CLOSED_REQUEST_STATUSES}::text[])
          AND r.department_id IS NOT NULL
          AND (
            (r.sla_due_at <= ${now} AND r.sla_due_at > ${since})
            OR (r.sla_at_risk_at <= ${now} AND r.sla_due_at > ${now} AND r.sla_at_risk_at > ${since})
          )
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = r.id
              AND n.type::text = CASE WHEN r.sla_due_at <= ${now} THEN 'SLA_BREACHED' ELSE 'SLA_AT_RISK' END
          )
        ORDER BY r.sla_due_at
        LIMIT ${BATCH}`;
      if (candidates.length === 0) return { alerts: 0, notifications: 0 };

      // One recipient lookup per department, not per request.
      const managers = new Map<string, string[]>();
      const escalation = new Map<string, string[]>();
      let sent = 0;
      for (const candidate of candidates) {
        const key = `${candidate.municipality_id}:${candidate.department_id}`;
        let recipients = managers.get(key);
        if (!recipients) {
          recipients = await this.notifications.departmentStaff(
            this.prisma.forTenant(candidate.municipality_id),
            candidate.department_id,
            Permission.REQUESTS_ASSIGN,
          );
          managers.set(key, recipients);
        }
        // A breach also escalates to the municipality's administrators.
        if (candidate.kind === 'SLA_BREACHED') {
          let admins = escalation.get(candidate.municipality_id);
          if (!admins) {
            admins = await this.notifications.municipalityAdmins(
              this.prisma.forTenant(candidate.municipality_id),
            );
            escalation.set(candidate.municipality_id, admins);
          }
          recipients = [...recipients, ...admins];
        }
        sent += await this.notifications.notify(tx, {
          municipalityId: candidate.municipality_id,
          recipients,
          actorId: null,
          content: slaNotification({
            kind: candidate.kind,
            requestId: candidate.id,
            publicNumber: candidate.public_number,
            title: candidate.title,
          }),
          at: now,
        });
      }
      return { alerts: candidates.length, notifications: sent };
    });
  }
}
