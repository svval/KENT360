import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { type Env, validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppThrottlerGuard } from './modules/auth/guards/app-throttler.guard';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { MunicipalityModule } from './modules/municipality/municipality.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { NeighborhoodsModule } from './modules/neighborhoods/neighborhoods.module';
import { RequestCategoriesModule } from './modules/request-categories/request-categories.module';
import { NumberingModule } from './modules/numbering/numbering.module';
import { RequestsModule } from './modules/requests/requests.module';
import { StorageModule } from './modules/storage/storage.module';
import { FieldTeamsModule } from './modules/field-teams/field-teams.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { OperationsModule } from './modules/operations/operations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditLogModule } from './modules/audit/audit-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // npm workspace scripts run with cwd = apps/api: an app-local .env wins,
      // otherwise the monorepo root .env is used.
      envFilePath: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // Secrets must never reach log storage.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.passwordHash',
                '*.refreshToken',
                '*.accessToken',
              ],
              censor: '[REDACTED]',
            },
            autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
            // Keep access logs lean: identity of the request, never headers or bodies.
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
          },
        };
      },
    }),
    // In-memory store for now; switched to Redis storage when the API runs multi-instance.
    // Disabled under NODE_ENV=test so e2e suites (many logins from one IP) are deterministic;
    // the tracker logic is unit tested.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    MunicipalityModule,
    DepartmentsModule,
    NeighborhoodsModule,
    RequestCategoriesModule,
    StorageModule,
    NumberingModule,
    RequestsModule,
    FieldTeamsModule,
    WorkOrdersModule,
    OperationsModule,
    NotificationsModule,
    ReportsModule,
    AuditLogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
