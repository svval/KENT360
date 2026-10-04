import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NeighborhoodsModule } from '../neighborhoods/neighborhoods.module';
import { RequestMediaService } from './request-media.service';
import { RequestWorkOrderSync } from './request-work-order-sync.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [NeighborhoodsModule, AiModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestMediaService, RequestWorkOrderSync],
  exports: [RequestsService, RequestWorkOrderSync],
})
export class RequestsModule {}
