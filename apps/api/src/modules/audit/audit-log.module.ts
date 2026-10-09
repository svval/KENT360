import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/** Audit trail read API (Phase 13); writing stays in the global AuditModule. */
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
