import { Injectable } from '@nestjs/common';
import { type HealthStatus } from '@kent360/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type Check = { status: 'up' | 'down'; latencyMs?: number; error?: string };

const SERVICE_NAME = 'kent360-api';

@Injectable()
export class HealthService {
  private readonly version = process.env.npm_package_version ?? '0.1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  liveness(): HealthStatus {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * Database down → "error" (HTTP 503). Object storage down → "degraded": requests can
   * still be filed without photos, but photo upload and display are broken – visible
   * here instead of only as broken images in the browser.
   */
  async readiness(): Promise<HealthStatus> {
    const [database, storage] = await Promise.all([
      this.check(async () => {
        // PostGIS_Version() doubles as a check that the spatial extension is installed.
        await this.prisma.$queryRaw`SELECT PostGIS_Version()`;
      }),
      this.check(() => this.storage.ping()),
    ]);
    return {
      ...this.liveness(),
      status: database.status !== 'up' ? 'error' : storage.status !== 'up' ? 'degraded' : 'ok',
      checks: { database, storage },
    };
  }

  private async check(probe: () => Promise<void>): Promise<Check> {
    const startedAt = performance.now();
    try {
      await probe();
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
