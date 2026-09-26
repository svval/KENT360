import { Module } from '@nestjs/common';
import { NeighborhoodsController } from './neighborhoods.controller';
import { NeighborhoodsService } from './neighborhoods.service';

@Module({
  controllers: [NeighborhoodsController],
  providers: [NeighborhoodsService],
})
export class NeighborhoodsModule {}
