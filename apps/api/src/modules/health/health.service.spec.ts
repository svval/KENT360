import { type PrismaService } from '../../prisma/prisma.service';
import { type StorageService } from '../storage/storage.service';
import { HealthService } from './health.service';

const service = (db: boolean, storage: boolean) =>
  new HealthService(
    {
      $queryRaw: () => (db ? Promise.resolve([]) : Promise.reject(new Error('down'))),
    } as unknown as PrismaService,
    {
      ping: () => (storage ? Promise.resolve() : Promise.reject(new TypeError('fetch failed'))),
    } as unknown as StorageService,
  );

describe('HealthService.readiness', () => {
  it('is ok when the database and object storage answer', async () => {
    const result = await service(true, true).readiness();
    expect(result.status).toBe('ok');
    expect(result.checks).toMatchObject({ database: { status: 'up' }, storage: { status: 'up' } });
  });

  it('is degraded – not silently ok – when only object storage is unreachable', async () => {
    const result = await service(true, false).readiness();
    expect(result.status).toBe('degraded');
    expect(result.checks?.storage).toMatchObject({ status: 'down', error: 'TypeError' });
  });

  it('is an error when the database is down', async () => {
    expect((await service(false, true).readiness()).status).toBe('error');
  });
});
