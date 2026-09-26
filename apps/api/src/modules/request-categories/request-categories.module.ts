import { Module } from '@nestjs/common';
import { RequestCategoriesController } from './request-categories.controller';
import { RequestCategoriesService } from './request-categories.service';

@Module({
  controllers: [RequestCategoriesController],
  providers: [RequestCategoriesService],
})
export class RequestCategoriesModule {}
