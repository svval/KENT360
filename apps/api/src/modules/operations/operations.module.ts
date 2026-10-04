import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { DashboardService } from './dashboard.service';
import { MapService } from './map.service';
import { DashboardController, MapController, SearchController } from './operations.controller';
import { SearchService } from './search.service';

/** Cross-domain read models: operations dashboard, map layers, global search (Phase 8–9). */
@Module({
  imports: [RequestsModule, WorkOrdersModule],
  controllers: [DashboardController, MapController, SearchController],
  providers: [DashboardService, MapService, SearchService],
})
export class OperationsModule {}
