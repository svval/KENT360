import { Controller, Get, Post, Body } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { Request } from './request.entity';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll(): Promise<Request[]> {
    return this.requestsService.findAll();
  }

  @Post()
  create(@Body('title') title: string): Promise<Request> {
    return this.requestsService.create(title);
  }
}