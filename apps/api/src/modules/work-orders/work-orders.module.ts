import { Module } from '@nestjs/common';
import { FieldTeamsModule } from '../field-teams/field-teams.module';
import { RequestsModule } from '../requests/requests.module';
import { WorkOrderMediaService } from './work-order-media.service';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [RequestsModule, FieldTeamsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderMediaService],
})
export class WorkOrdersModule {}
