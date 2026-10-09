import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SlaAlertsService } from './sla-alerts.service';

/** In-app notification inbox (Phase 13). Global: workflows write notifications in their transactions. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SlaAlertsService],
  exports: [NotificationsService, SlaAlertsService],
})
export class NotificationsModule {}
