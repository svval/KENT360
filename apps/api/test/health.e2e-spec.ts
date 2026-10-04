import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Boots the full application. Liveness must answer even without a database;
 * the readiness assertion adapts to whether the docker infrastructure is running.
 */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 { status: "ok" } without the envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'kent360-api' });
    expect(res.body.success).toBeUndefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/ready reports the database and object storage checks', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks.database.status).toBe(res.status === 200 ? 'up' : 'down');
    // e2e runs against the real MinIO (media tests need it): storage must be reachable.
    expect(res.body.checks.storage.status).toBe('up');
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
