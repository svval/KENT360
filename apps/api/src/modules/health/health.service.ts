import { Injectable } from '@nestjs/common';
import { type HealthStatus } from '@kent360/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

const SERVICE_NAME = 'kent360-api';

@Injectable()
export class HealthService {
  private readonly version = process.env.npm_package_version ?? '0.1.0';

  constructor(private readonly prisma: PrismaService) {}

  liveness(): HealthStatus {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async readiness(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    return {
      ...this.liveness(),
      status: database.status === 'up' ? 'ok' : 'error',
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'up' | 'down';
    latencyMs?: number;
    error?: string;
  }> {
    const startedAt = performance.now();
    try {
      // PostGIS_Version() doubles as a check that the spatial extension is installed.
      await this.prisma.$queryRaw`SELECT PostGIS_Version()`;
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        // Only the error class is exposed; connection strings must never leak.
        error: error instanceof Error ? error.name : 'UnknownError',
      };
    }
  }
}
