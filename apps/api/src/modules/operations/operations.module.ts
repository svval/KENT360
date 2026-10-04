import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { DashboardService } from './dashboard.service';
import { MapService } from './map.service';
import {
  AnalyticsController,
  DashboardController,
  MapController,
  SearchController,
} from './operations.controller';
import { PulseService } from './pulse.service';
import { SearchService } from './search.service';

/** Cross-domain read models: operations dashboard, map layers, global search (Phase 8–9), MahallePulse (Phase 10). */
@Module({
  imports: [RequestsModule, WorkOrdersModule],
  controllers: [DashboardController, MapController, SearchController, AnalyticsController],
  providers: [DashboardService, MapService, SearchService, PulseService],
})
export class OperationsModule {}
