import { seedDemoMunicipality, seedDemoUsers, seedRbac } from '../prisma/seed-data';
import { seedMunicipalityDomain } from '../prisma/seed-domain';
import { seedDemoRequests } from '../prisma/seed-requests';
import { seedDemoWorkOrders } from '../prisma/seed-work-orders';
import { hashPassword } from '../src/modules/auth/domain/password-policy';
import { StorageService } from '../src/modules/storage/storage.service';
import { createTestApp, type TestApp } from './support/test-app';

/**
 * The development seed, run twice against the test database (kent360_test and the
 * kent360-media-test bucket – never the development data): the second run must not
 * add anything, and the demo work orders must obey the same rules as the API.
 */
describe('Development seed (e2e)', () => {
  let t: TestApp;
  let municipalityId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('is idempotent', async () => {
    const storage = t.app.get(StorageService);
    const put = (key: string, body: Buffer, type: string) => storage.put(key, body, type);
    const runSeed = async () => {
      const roles = await seedRbac(t.prisma);
      municipalityId = await seedDemoMunicipality(t.prisma);
      await seedDemoUsers(t.prisma, municipalityId, roles, hashPassword);
      await seedMunicipalityDomain(t.prisma, municipalityId);
      const requests = await seedDemoRequests(t.prisma, municipalityId);
      const field = await seedDemoWorkOrders(t.prisma, municipalityId, hashPassword, put);
      return { requests, ...field };
    };
    await runSeed();
    const counts = async () => ({
      requests: await t.prisma.request.count({ where: { municipalityId } }),
      workOrders: await t.prisma.workOrder.count({ where: { municipalityId } }),
      teams: await t.prisma.fieldTeam.count({ where: { municipalityId } }),
      media: await t.prisma.workOrderMedia.count({ where: { workOrder: { municipalityId } } }),
    });
    const first = await counts();
    expect(await runSeed()).toEqual({ requests: 0, teams: 0, users: 0, workOrders: 0 });
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ requests: 120, workOrders: 45, teams: 5 });
  });

  it('creates demo work orders that follow the API rules', async () => {
    const workOrders = await t.prisma.workOrder.findMany({
      where: { municipalityId },
      select: {
        status: true,
        publicNumber: true,
        completionDescription: true,
        fieldTeamId: true,
        departmentId: true,
        fieldTeam: { select: { departmentId: true } },
        request: { select: { status: true, departmentId: true } },
        media: { select: { type: true } },
        assignments: { select: { unassignedAt: true } },
      },
    });
    const statuses = new Set(workOrders.map((w) => w.status));
    for (const status of [
      'CREATED',
      'ASSIGNED',
      'ACCEPTED',
      'EN_ROUTE',
      'ON_SITE',
      'IN_PROGRESS',
      'WAITING',
      'COMPLETED',
      'VERIFIED',
    ]) {
      expect(statuses).toContain(status);
    }
    expect(new Set(workOrders.map((w) => w.publicNumber)).size).toBe(workOrders.length);
    const requestFor: Record<string, string[]> = {
      CREATED: ['WORK_ORDER_CREATED'],
      ASSIGNED: ['WORK_ORDER_CREATED'],
      ACCEPTED: ['WORK_ORDER_CREATED'],
      EN_ROUTE: ['WORK_ORDER_CREATED'],
      ON_SITE: ['WORK_ORDER_CREATED'],
      IN_PROGRESS: ['IN_PROGRESS'],
      WAITING: ['IN_PROGRESS'],
      COMPLETED: ['RESOLVED'],
      VERIFIED: ['VERIFIED', 'CLOSED'],
    };
    for (const wo of workOrders) {
      expect(requestFor[wo.status]).toContain(wo.request?.status);
      expect(wo.request?.departmentId).toBe(wo.departmentId);
      if (wo.fieldTeamId) expect(wo.fieldTeam?.departmentId).toBe(wo.departmentId);
      if (wo.status === 'COMPLETED' || wo.status === 'VERIFIED') {
        expect(wo.completionDescription).toBeTruthy();
        expect(wo.media.map((m) => m.type)).toEqual(expect.arrayContaining(['BEFORE', 'AFTER']));
      }
      expect(wo.assignments.filter((a) => a.unassignedAt === null).length).toBeLessThanOrEqual(1);
    }
  });
});
