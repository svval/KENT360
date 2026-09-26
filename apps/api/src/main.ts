import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, setupSwagger } from './bootstrap';
import { type Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  configureApp(app);

  const swaggerEnabled =
    config.get('SWAGGER_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (swaggerEnabled) setupSwagger(app);

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`KENT360 API listening on http://localhost:${port}/${API_PREFIX}`);
  if (swaggerEnabled) logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

void bootstrap();
