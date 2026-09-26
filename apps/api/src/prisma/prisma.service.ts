import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { type Env } from '../config/env.validation';
import { tenantScopeExtension } from '../common/tenant/tenant-scope';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit(): Promise<void> {
    // The API still boots when the database is down so /health (liveness) keeps
    // answering; /health/ready reports the outage and orchestrators can react.
    try {
      // With driver adapters $connect() is lazy, so run a real round-trip.
      await this.$queryRaw`SELECT 1`;
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error(
        { err: error },
        'Could not connect to PostgreSQL – is the infrastructure running? (npm run infra:up)',
      );
    }
  }

  /**
   * Client whose tenant-owned models are confined to one municipality.
   * Use this for every tenant data access; see common/tenant/tenant-scope.ts.
   */
  forTenant(municipalityId: string) {
    return this.$extends(tenantScopeExtension(municipalityId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
