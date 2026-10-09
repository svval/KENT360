import { type INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { type Env } from './config/env.validation';

export const API_PREFIX = 'api/v1';

/** JSON body limits: 100 kB everywhere, except the GeoJSON import (real boundary files are MBs). */
export const DEFAULT_BODY_LIMIT = '100kb';
export const IMPORT_BODY_LIMIT = '10mb';

/**
 * HTTP pipeline shared by main.ts and the e2e test harness, so tests exercise
 * exactly the same prefixing, validation and security middleware as production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  // The import route parses first with the larger limit; the general parser then skips the
  // already-parsed body. The general JSON parser must be registered here explicitly: Nest
  // skips its own once it sees any "jsonParser" middleware, which would leave every other
  // route without a body.
  app.use(`/${API_PREFIX}/neighborhoods/import`, json({ limit: IMPORT_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));

  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // CSV exports: the web app reads the server's file name.
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('KENT360 API')
      .setDescription(
        'Smart Municipal Operations & Urban Intelligence Platform – REST API.\n\n' +
          'All endpoints except health probes are served under `/api/v1` and return the ' +
          'standard `{ success, data, meta? }` envelope.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });
}
