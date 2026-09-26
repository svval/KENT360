import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { type HealthStatus } from '@kent360/shared-types';
import { type Response } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { HealthService } from './health.service';

@ApiTags('System')
@Controller('health')
@RawResponse()
@SkipThrottle()
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe – the process is up and serving HTTP' })
  @ApiOkResponse({ description: '{ "status": "ok", ... }' })
  liveness(): HealthStatus {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe – dependencies (PostgreSQL + PostGIS) are reachable' })
  @ApiOkResponse({ description: 'All dependencies are up' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is down' })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const result = await this.health.readiness();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
