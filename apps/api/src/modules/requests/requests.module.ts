import { Module } from '@nestjs/common';
import { NeighborhoodsModule } from '../neighborhoods/neighborhoods.module';
import { RequestMediaService } from './request-media.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [NeighborhoodsModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestMediaService],
  exports: [RequestsService],
})
export class RequestsModule {}
