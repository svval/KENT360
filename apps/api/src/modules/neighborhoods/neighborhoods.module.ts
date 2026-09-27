import { Module } from '@nestjs/common';
import { NeighborhoodLocator } from './neighborhood-locator';
import { NeighborhoodsController } from './neighborhoods.controller';
import { NeighborhoodsService } from './neighborhoods.service';

@Module({
  controllers: [NeighborhoodsController],
  providers: [NeighborhoodsService, NeighborhoodLocator],
  exports: [NeighborhoodLocator],
})
export class NeighborhoodsModule {}
