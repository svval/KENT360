import { randomUUID } from 'node:crypto';
import { RoleCode } from '@kent360/shared-types';
import { localDateKey, startOfLocalDay } from '../src/modules/operations/domain/local-time';
import {
  addUser,
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

type Who = string;
const MINUTE = 60_000;
const DAY = 86_400_000;
const BOX = '35.95,35.95,36.20,36.20'; // west,south,east,north – everything but "far"

describe('Operations dashboard, map and search (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const auth: Record<Who, ReturnType<typeof bearer>> = {};
  const ids: Record<string, string> = {};
  const numbers: Record<string, string> = {};
  const now = Date.now();
  const run = randomUUID().slice(0, 6);
  let timeZone = 'Europe/Istanbul';

  const get = (who: Who, path: string) => t.http().get(`/api/v1${path}`).set(auth[who]);

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Ops');
    b = await createTenant(t.prisma, 'Opsb');
    const p = t.prisma;
    timeZone = (await p.municipality.findUniqueOrThrow({ where: { id: a.municipalityId } }))
      .timezone;
    const works = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'WORKS', name: 'Fen İşleri' },
    });
    const parks = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'PARKS', name: 'Park ve Bahçeler' },
    });
    const road = await p.requestCategory.create({
      data: { municipalityId: a.municipalityId, code: 'ROAD', name: 'Yol', departmentId: works.id },
    });
    const pothole = await p.requestCategory.create({
      data: {
        municipalityId: a.municipalityId,
        code: 'POTHOLE',
        name: 'Yol Çukuru',
        parentId: road.id,
        departmentId: works.id,
      },
    });
    const play = await p.requestCategory.create({
      data: {
        municipalityId: a.municipalityId,
        code: 'PLAY',
        name: 'Oyun',
        departmentId: parks.id,
      },
    });
    Object.assign(ids, { works: works.id, parks: parks.id });
    await p.user.updateMany({
      where: { id: { in: [a.users.manager.id, a.users.field.id] } },
      data: { departmentId: works.id },
    });
    const users = {
      ...a.users,
      parksManager: await addUser(p, a.municipalityId, 'pm', RoleCode.DEPARTMENT_MANAGER, parks.id),
      outsider: await addUser(p, a.municipalityId, 'out', RoleCode.FIELD_STAFF, works.id),
      bAdmin: b.users.admin,
    };
    for (const [who, user] of Object.entries(users)) {
      if (who !== 'disabled') auth[who] = bearer((await login(t, user.email)).accessToken);
    }

    // Requests with known times, written directly (created_at is immutable via the API).
    let seq = 0;
    const request = async (
      key: string,
      data: {
        department: 'works' | 'parks';
        createdAt: number;
        status?: string;
        priority?: string;
        slaDueAt?: number;
        resolvedAt?: number;
        far?: boolean;
      },
    ) => {
      seq += 1;
      const publicNumber = `KNT-2026-9${run.replace(/\D/g, '1').slice(0, 2)}${String(seq).padStart(3, '0')}`;
      const row = await p.request.create({
        data: {
          municipalityId: a.municipalityId,
          publicNumber,
          title: `Ops ${key}`,
          description: `Operasyon testi ${key} ${run} – yolda çukur`,
          categoryId: data.department === 'works' ? pothole.id : play.id,
          departmentId: data.department === 'works' ? works.id : parks.id,
          status: (data.status ?? 'NEW') as never,
          priority: (data.priority ?? 'NORMAL') as never,
          latitude: data.far ? 40 : 36.01,
          longitude: data.far ? 40 : 36.01,
          address: `Ops Sk. ${key}`,
          createdAt: new Date(data.createdAt),
          slaDueAt: data.slaDueAt ? new Date(data.slaDueAt) : null,
          slaAtRiskAt: data.slaDueAt
            ? new Date(Math.min(data.slaDueAt, data.createdAt + MINUTE))
            : null,
          resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
        },
      });
      ids[key] = row.id;
      numbers[key] = publicNumber;
    };
    await request('r1', { department: 'works', createdAt: now - MINUTE, slaDueAt: now + DAY });
    await request('r2', {
      department: 'works',
      createdAt: now - 2 * MINUTE,
      priority: 'CRITICAL',
      slaDueAt: now + 4 * 3_600_000,
    });
    await request('r3', {
      department: 'parks',
      createdAt: now - 3 * DAY,
      status: 'UNDER_REVIEW',
      slaDueAt: now - 2 * DAY,
    });
    await request('r4', {
      department: 'works',
      createdAt: now - 5 * DAY,
      status: 'CLOSED',
      slaDueAt: now - 3 * DAY,
      resolvedAt: now - 4 * DAY,
    }); // on time, 1 day
    await request('r5', {
      department: 'parks',
      createdAt: now - 6 * DAY,
      status: 'RESOLVED',
      slaDueAt: now - 4 * DAY,
      resolvedAt: now - 3 * DAY,
    }); // late, 3 days
    await request('far', { department: 'works', createdAt: now - 2 * DAY, far: true });
    await request('ready', {
      department: 'works',
      createdAt: now - 10 * DAY,
      status: 'ASSIGNED_TO_DEPARTMENT',
    });

    // A work order on team 1 assigned to the field user.
    const wo = await t
      .http()
      .post('/api/v1/work-orders')
      .set(auth.manager)
      .send({ requestId: ids.ready })
      .expect(201);
    ids.wo = wo.body.data.id;
    numbers.wo = wo.body.data.publicNumber;
    const team = await t
      .http()
      .post('/api/v1/field-teams')
      .set(auth.manager)
      .send({
        departmentId: works.id,
        name: 'Ops Ekip',
        code: `OPS_${run.toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`,
      })
      .expect(201);
    await t
      .http()
      .put(`/api/v1/field-teams/${team.body.data.id}/members`)
      .set(auth.manager)
      .send({ members: [{ userId: a.users.field.id, role: 'MEMBER' }] })
      .expect(200);
    await t
      .http()
      .post(`/api/v1/work-orders/${ids.wo}/assignment`)
      .set(auth.manager)
      .send({ fieldTeamId: team.body.data.id, assignedUserId: a.users.field.id })
      .expect(200);
  });

  afterAll(async () => {
    await t.close();
  });

  // ─── Dashboard ───────────────────────────────────────────────────────

  describe('dashboard', () => {
    const todayStart = () => startOfLocalDay(new Date(), timeZone).getTime();

    it('computes the admin KPIs over the whole municipality', async () => {
      const res = await get('admin', '/dashboard/overview').expect(200);
      const { kpis } = res.body.data;
      const createdToday = [now - MINUTE, now - 2 * MINUTE].filter((x) => x >= todayStart());
      expect(kpis.todayRequests.value).toBe(createdToday.length);
      expect(kpis.openRequests.value).toBe(5); // r1 r2 r3 far ready(WORK_ORDER_CREATED)
      expect(kpis.criticalRequests.value).toBe(1);
      expect(kpis.openWorkOrders.value).toBe(1);
      expect(kpis.avgResolutionMinutes.value).toBe(2880); // (1 day + 3 days) / 2
      expect(kpis.slaCompliancePercent.value).toBe(50);
      expect(res.body.data.timeZone).toBe(timeZone);
    });

    it('limits a department manager to the department', async () => {
      const { kpis, recentRequests, criticalRequests } = (
        await get('manager', '/dashboard/overview').expect(200)
      ).body.data;
      expect(kpis.openRequests.value).toBe(4); // r1 r2 far ready
      expect(kpis.avgResolutionMinutes.value).toBe(1440);
      expect(kpis.slaCompliancePercent.value).toBe(100);
      expect(
        new Set(recentRequests.map((r: { department: { id: string } }) => r.department.id)),
      ).toEqual(new Set([ids.works]));
      expect(criticalRequests.map((r: { id: string }) => r.id)).not.toContain(ids.r3);
    });

    it('builds a 30-day local trend of created and resolved requests', async () => {
      const { trend } = (await get('admin', '/dashboard/overview').expect(200)).body.data;
      expect(trend).toHaveLength(30);
      expect(trend.at(-1).date).toBe(localDateKey(new Date(), timeZone));
      const at = (ms: number) =>
        trend.find((d: { date: string }) => d.date === localDateKey(new Date(ms), timeZone));
      const total = (key: 'created' | 'resolved') =>
        trend.reduce((sum: number, d: Record<string, number>) => sum + d[key], 0);
      expect(total('created')).toBe(7);
      expect(total('resolved')).toBe(2);
      expect(at(now - 4 * DAY).resolved).toBeGreaterThanOrEqual(1);
      expect(at(now - 3 * DAY).resolved).toBeGreaterThanOrEqual(1);
      expect(at(now - 6 * DAY).created).toBeGreaterThanOrEqual(1);
    });

    it('ranks critical requests: CRITICAL, then SLA breached, then at risk', async () => {
      const { criticalRequests } = (await get('admin', '/dashboard/overview')).body.data;
      expect(criticalRequests.map((r: { id: string; reason: string }) => [r.id, r.reason])).toEqual(
        [
          [ids.r2, 'CRITICAL'],
          [ids.r3, 'BREACHED'],
          // r1's risk threshold (createdAt + 1 min) has passed; r2 is listed once, as CRITICAL.
          [ids.r1, 'AT_RISK'],
        ],
      );
    });

    it('is closed to citizens and field staff, and to other tenants’ data', async () => {
      await get('citizen', '/dashboard/overview').expect(403);
      await get('field', '/dashboard/overview').expect(403);
      const other = (await get('bAdmin', '/dashboard/overview').expect(200)).body.data;
      expect(other.kpis.openRequests.value).toBe(0);
      expect(other.recentRequests).toEqual([]);
    });
  });

  // ─── Map ─────────────────────────────────────────────────────────────

  describe('map', () => {
    const idsOf = (body: { features: { properties: { id: string } }[] }) =>
      body.features.map((f) => f.properties.id);

    it('returns valid, lean GeoJSON inside the bbox', async () => {
      const res = await get('admin', `/map/requests?bbox=${BOX}`).expect(200);
      expect(res.body.type).toBe('FeatureCollection');
      expect(res.body.success).toBeUndefined(); // no envelope: MapLibre reads it directly
      const found = idsOf(res.body);
      expect(found).toEqual(
        expect.arrayContaining([ids.r1, ids.r2, ids.r3, ids.r4, ids.r5, ids.ready]),
      );
      expect(found).not.toContain(ids.far);
      for (const feature of res.body.features) {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry.type).toBe('Point');
        const [lng, lat] = feature.geometry.coordinates;
        expect(lng).toBeCloseTo(36.01);
        expect(lat).toBeCloseTo(36.01);
        expect(Object.keys(feature.properties).sort()).toEqual(
          [
            'category',
            'createdAt',
            'critical',
            'department',
            'done',
            'id',
            'neighborhood',
            'priority',
            'publicNumber',
            'slaStatus',
            'status',
          ].sort(),
        );
      }
      const byId = new Map(
        res.body.features.map((f: { properties: { id: string } }) => [
          f.properties.id,
          f.properties,
        ]),
      );
      expect(byId.get(ids.r2)).toMatchObject({ critical: true, done: false });
      expect(byId.get(ids.r3)).toMatchObject({ critical: true, slaStatus: 'BREACHED' });
      expect(byId.get(ids.r4)).toMatchObject({ critical: false, done: true });
      // Without a bbox the whole scope is returned.
      expect(idsOf((await get('admin', '/map/requests')).body)).toContain(ids.far);
    });

    it('applies filters and the department scope', async () => {
      const open = idsOf((await get('admin', `/map/requests?bbox=${BOX}&open=true`)).body);
      expect(open).not.toContain(ids.r4);
      expect(open).toContain(ids.r1);
      const critical = idsOf((await get('admin', '/map/requests?priority=CRITICAL')).body);
      expect(critical).toEqual([ids.r2]);
      const manager = idsOf((await get('manager', '/map/requests')).body);
      expect(manager).not.toContain(ids.r3);
      expect(manager).toContain(ids.r1);
      expect(idsOf((await get('manager', `/map/requests?departmentId=${ids.parks}`)).body)).toEqual(
        [],
      );
      await get('admin', '/map/requests?bbox=36.2,35.9,36.0,36.1').expect(400);
    });

    it('isolates tenants and keeps citizens out', async () => {
      expect(idsOf((await get('bAdmin', '/map/requests')).body)).toEqual([]);
      expect(idsOf((await get('bAdmin', '/map/work-orders')).body)).toEqual([]);
      await get('citizen', '/map/requests').expect(403);
      await get('citizen', '/map/work-orders').expect(403);
    });

    it('shows field staff only their own work orders', async () => {
      const field = (await get('field', `/map/work-orders?bbox=${BOX}`).expect(200)).body;
      expect(idsOf(field)).toEqual([ids.wo]);
      expect(field.features[0].properties).toMatchObject({
        publicNumber: numbers.wo,
        status: 'ASSIGNED',
        team: 'Ops Ekip',
        requestNumber: numbers.ready,
      });
      expect(idsOf((await get('outsider', '/map/work-orders')).body)).toEqual([]);
      expect(idsOf((await get('manager', '/map/work-orders')).body)).toContain(ids.wo);
      expect(idsOf((await get('parksManager', '/map/work-orders')).body)).toEqual([]);
      // Field staff have no request layer.
      await get('field', '/map/requests').expect(403);
    });
  });

  // ─── Search ──────────────────────────────────────────────────────────

  describe('global search', () => {
    const search = async (who: Who, q: string) =>
      (await get(who, `/search?q=${encodeURIComponent(q)}`).expect(200)).body.data as {
        type: string;
        id: string;
      }[];

    it('finds requests and work orders by number and text', async () => {
      expect(await search('admin', numbers.r1)).toEqual([
        expect.objectContaining({ type: 'REQUEST', id: ids.r1 }),
      ]);
      expect(await search('admin', numbers.wo)).toEqual([
        expect.objectContaining({ type: 'WORK_ORDER', id: ids.wo }),
      ]);
      const text = await search('admin', `testi r3 ${run}`.slice(0, 40));
      expect(text.map((i) => i.id)).toContain(ids.r3);
      const address = await search('admin', 'Ops Sk. r5');
      expect(address.map((i) => i.id)).toContain(ids.r5);
    });

    it('never leaves the user’s scope', async () => {
      expect(await search('parksManager', numbers.r1)).toEqual([]);
      expect(await search('bAdmin', numbers.r1)).toEqual([]);
      expect(await search('field', numbers.r1)).toEqual([]); // no request access
      expect((await search('field', numbers.wo)).map((i) => i.id)).toEqual([ids.wo]);
      expect(await search('outsider', numbers.wo)).toEqual([]);
      expect(await search('citizen', numbers.r1)).toEqual([]);
      await get('admin', '/search?q=x').expect(400);
    });
  });
});
