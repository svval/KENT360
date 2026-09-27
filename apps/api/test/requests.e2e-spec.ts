import { randomUUID } from 'node:crypto';
import { AuditAction, RoleCode } from '@kent360/shared-types';
import sharp from 'sharp';
import { NumberingService } from '../src/modules/numbering/numbering.service';
import {
  animatedWebp,
  corruptJpeg,
  hugeDimensionPng,
  jpegWithMetadata,
  metadataTraces,
  plainImage,
  pngWithMetadata,
  webpWithMetadata,
} from './support/images';
import {
  addUser,
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

type Auth = ReturnType<typeof bearer>;
const box = (w: number, s: number, e: number, n: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ],
  ],
});
const minutes = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000;

describe('Requests (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const auth: Record<string, Auth> = {};
  const ids: Record<string, string> = {};
  const run = randomUUID().slice(0, 6);

  const create = (who: string, body: Record<string, unknown>) =>
    t.http().post('/api/v1/requests').set(auth[who]).send(body);
  const pothole = (extra: Record<string, unknown> = {}) => ({
    categoryId: ids.pothole,
    description: `Okul önündeki yolda büyük bir çukur var (${run}).`,
    latitude: 36.01,
    longitude: 36.01,
    address: 'Deneme Sk. No: 1',
    ...extra,
  });

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Alfa');
    b = await createTenant(t.prisma, 'Beta');
    const p = t.prisma;

    const dept = (municipalityId: string, code: string, name: string) =>
      p.department.create({ data: { municipalityId, code, name } });
    const works = await dept(a.municipalityId, 'WORKS', 'Fen İşleri');
    const parks = await dept(a.municipalityId, 'PARKS', 'Park ve Bahçeler');
    const closing = await dept(a.municipalityId, 'CLOSING', 'Kapanan Birim');
    const bWorks = await dept(b.municipalityId, 'WORKS', 'Beta Fen');
    Object.assign(ids, { works: works.id, parks: parks.id, closing: closing.id });

    const cat = (municipalityId: string, data: Record<string, unknown>) =>
      p.requestCategory.create({ data: { municipalityId, ...data } as never });
    const road = await cat(a.municipalityId, {
      code: 'ROAD',
      name: 'Yol',
      departmentId: works.id,
      defaultSlaMinutes: 4320,
    });
    ids.road = road.id;
    ids.pothole = (
      await cat(a.municipalityId, {
        code: 'POTHOLE',
        name: 'Yol Çukuru',
        parentId: road.id,
        departmentId: works.id,
        defaultPriority: 'HIGH',
        defaultSlaMinutes: 240,
      })
    ).id;
    ids.asphalt = (
      await cat(a.municipalityId, {
        code: 'ASPHALT',
        name: 'Asfalt',
        parentId: road.id,
        departmentId: works.id,
      })
    ).id;
    ids.closingRoute = (
      await cat(a.municipalityId, {
        code: 'CLOSING_ROUTE',
        name: 'Kapanan',
        parentId: road.id,
        departmentId: closing.id,
      })
    ).id;
    ids.inactiveCat = (
      await cat(a.municipalityId, {
        code: 'OLD',
        name: 'Eski',
        parentId: road.id,
        departmentId: works.id,
        status: 'INACTIVE',
      })
    ).id;
    const park = await cat(a.municipalityId, {
      code: 'PARK',
      name: 'Park',
      departmentId: parks.id,
    });
    ids.play = (
      await cat(a.municipalityId, {
        code: 'PLAY',
        name: 'Oyun Grubu',
        parentId: park.id,
        departmentId: parks.id,
        defaultSlaMinutes: 1440,
      })
    ).id;
    const bRoot = await cat(b.municipalityId, {
      code: 'ROAD',
      name: 'Beta Yol',
      departmentId: bWorks.id,
    });
    ids.bCategory = (
      await cat(b.municipalityId, {
        code: 'POTHOLE',
        name: 'Beta Çukur',
        parentId: bRoot.id,
        departmentId: bWorks.id,
        defaultSlaMinutes: 60,
      })
    ).id;

    const citizen2 = await addUser(p, a.municipalityId, 'citizen2', RoleCode.CITIZEN);
    const managerWorks = await addUser(
      p,
      a.municipalityId,
      'mworks',
      RoleCode.DEPARTMENT_MANAGER,
      works.id,
    );
    const managerParks = await addUser(
      p,
      a.municipalityId,
      'mparks',
      RoleCode.DEPARTMENT_MANAGER,
      parks.id,
    );
    for (const [key, email] of [
      ['admin', a.users.admin.email],
      ['citizen', a.users.citizen.email],
      ['field', a.users.field.email],
      ['citizen2', citizen2.email],
      ['managerWorks', managerWorks.email],
      ['managerParks', managerParks.email],
      ['bAdmin', b.users.admin.email],
      ['bCitizen', b.users.citizen.email],
    ] as const) {
      auth[key] = bearer((await login(t, email)).accessToken);
    }
    ids.citizen = a.users.citizen.id;

    await t
      .http()
      .post('/api/v1/neighborhoods')
      .set(auth.admin)
      .send({ name: 'Test Mahallesi', code: 'NB1', geometry: box(36.0, 36.0, 36.02, 36.02) })
      .expect(201);
  });

  afterAll(async () => {
    await t.close();
  });

  // ─── Creation, routing, SLA ───────────────────────────────────────────

  describe('creation', () => {
    it('creates a request with server-side routing, priority, SLA, number and neighbourhood', async () => {
      const res = await create('citizen', pothole()).expect(201);
      const r = res.body.data;
      ids.first = r.id;
      expect(r.publicNumber).toMatch(/^KNT-\d{4}-\d{6}$/);
      expect(r).toMatchObject({
        status: 'NEW',
        priority: 'HIGH',
        source: 'WEB',
        title: 'Yol Çukuru – Test Mahallesi',
        department: { id: ids.works, name: 'Fen İşleri' },
        category: { id: ids.pothole, parent: { id: ids.road, name: 'Yol' } },
        neighborhood: { code: 'NB1' },
        locationNotice: null,
        address: 'Deneme Sk. No: 1',
      });
      expect(minutes(r.createdAt, r.sla.dueAt)).toBe(240);
      expect(minutes(r.sla.atRiskAt, r.sla.dueAt)).toBe(60); // last 25 %
      expect(r.sla).toMatchObject({ status: 'ON_TIME' });
      expect(r.timeline.map((e: { type: string }) => e.type)).toEqual([
        'CREATED',
        'DEPARTMENT_ASSIGNED',
      ]);
      expect(r.timeline[1].description).toBe('Fen İşleri birimine yönlendirildi.');
      expect(r.timeline.every((e: { performedBy: string | null }) => e.performedBy === null)).toBe(
        true,
      );
      expect(r.reporter).toBeNull();

      const [audit] = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.REQUEST_CREATED, entityId: r.id },
      });
      expect(audit.afterData).toMatchObject({
        publicNumber: r.publicNumber,
        departmentId: ids.works,
      });
    });

    it('marks staff-created requests as MUNICIPAL_STAFF', async () => {
      const res = await create('admin', pothole()).expect(201);
      expect(res.body.data.source).toBe('MUNICIPAL_STAFF');
    });

    it.each([
      ['status', 'CLOSED'],
      ['departmentId', '00000000-0000-7000-8000-000000000001'],
      ['municipalityId', '00000000-0000-7000-8000-000000000001'],
      ['neighborhoodId', '00000000-0000-7000-8000-000000000001'],
      ['priority', 'CRITICAL'],
      ['publicNumber', 'KNT-2026-999999'],
      ['slaDueAt', '2030-01-01T00:00:00Z'],
      ['source', 'API'],
      ['title', 'Benim başlığım'],
    ])('refuses a client-supplied %s (mass assignment)', async (field, value) => {
      const res = await create('citizen', pothole({ [field]: value })).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a root category that has sub-categories', async () => {
      const res = await create('citizen', pothole({ categoryId: ids.road })).expect(400);
      expect(res.body.code).toBe('CATEGORY_NOT_SELECTABLE');
    });

    it('rejects an inactive category', async () => {
      const res = await create('citizen', pothole({ categoryId: ids.inactiveCat })).expect(409);
      expect(res.body.code).toBe('CATEGORY_INACTIVE');
    });

    it('rejects another municipality’s category', async () => {
      const res = await create('citizen', pothole({ categoryId: ids.bCategory })).expect(404);
      expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('rejects a category routed to an inactive department', async () => {
      // Phase 4 forbids this state through the API; set it directly to test the guard.
      await t.prisma.department.update({
        where: { id: ids.closing },
        data: { status: 'INACTIVE' },
      });
      const res = await create('citizen', pothole({ categoryId: ids.closingRoute })).expect(409);
      expect(res.body.code).toBe('DEPARTMENT_INACTIVE');
    });

    it('inherits the SLA from the root category', async () => {
      const r = (await create('citizen', pothole({ categoryId: ids.asphalt })).expect(201)).body
        .data;
      expect(minutes(r.createdAt, r.sla.dueAt)).toBe(4320);
      expect(r.priority).toBe('NORMAL');
    });

    it('keeps routing and SLA as a snapshot when the category changes later', async () => {
      const r = (await create('citizen', pothole({ categoryId: ids.play })).expect(201)).body.data;
      await t
        .http()
        .patch(`/api/v1/request-categories/${ids.play}`)
        .set(auth.admin)
        .send({ defaultSlaMinutes: 60, departmentId: ids.works })
        .expect(200);
      const again = (await t.http().get(`/api/v1/requests/${r.id}`).set(auth.admin).expect(200))
        .body.data;
      expect(again.sla.dueAt).toBe(r.sla.dueAt);
      expect(again.department.id).toBe(ids.parks);
      // The database refuses to rewrite the snapshot, whoever tries.
      await expect(
        t.prisma.request.update({ where: { id: r.id }, data: { slaDueAt: new Date() } }),
      ).rejects.toThrow();
      // The reporter can only fall back to NULL (account deleted), never be replaced –
      // not even in two steps via NULL.
      await expect(
        t.prisma.request.update({ where: { id: r.id }, data: { createdById: a.users.admin.id } }),
      ).rejects.toThrow();
      await t.prisma.request.update({ where: { id: r.id }, data: { createdById: null } });
      await expect(
        t.prisma.request.update({ where: { id: r.id }, data: { createdById: a.users.admin.id } }),
      ).rejects.toThrow();
    });

    it('accepts a location outside all neighbourhoods, flagging it', async () => {
      const r = (await create('citizen', pothole({ latitude: 39.9, longitude: 32.8 })).expect(201))
        .body.data;
      expect(r.neighborhood).toBeNull();
      expect(r.locationNotice).toBe('Konum tanımlı mahalle sınırları dışında.');
      expect(r.title).toBe('Yol Çukuru');
    });

    it.each([
      [{ latitude: 91 }],
      [{ longitude: -181 }],
      [{ latitude: 'abc' }],
      [{ latitude: null }],
      [{ description: 'kısa' }],
    ])('validates %j', async (patch) => {
      await create('citizen', pothole(patch)).expect(400);
    });
  });

  // ─── Numbering ───────────────────────────────────────────────────────

  describe('public numbers', () => {
    it('never duplicates numbers under concurrent creation', async () => {
      const results = await Promise.all(
        Array.from({ length: 25 }, () => create('citizen', pothole())),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results.map((r) => r.body.data.publicNumber as string);
      expect(new Set(numbers).size).toBe(25);
      const sequence = numbers.map((n) => Number(n.split('-')[2])).sort((x, y) => x - y);
      expect(sequence.at(-1)! - sequence[0]).toBe(24); // consecutive, no gaps
    });

    it('numbers per municipality: two tenants may both hold the same number', async () => {
      const numbering = t.app.get(NumberingService);
      const at = new Date('2040-03-01T10:00:00Z');
      const [x, y] = [
        await numbering.next(t.prisma, a.municipalityId, 'REQUEST', at, 'UTC'),
        await numbering.next(t.prisma, b.municipalityId, 'REQUEST', at, 'UTC'),
      ];
      expect(x).toBe(y);
      const res = await t
        .http()
        .post('/api/v1/requests')
        .set(auth.bCitizen)
        .send({
          categoryId: ids.bCategory,
          description: 'Beta tarafında bir bildirim.',
          latitude: 36,
          longitude: 36,
        })
        .expect(201);
      expect(res.body.data.publicNumber).toMatch(/^KNT-\d{4}-000001$/);
    });

    it('restarts the sequence per municipality and year', async () => {
      const numbering = t.app.get(NumberingService);
      const at = new Date('2031-06-01T10:00:00Z');
      expect(
        await numbering.next(t.prisma, a.municipalityId, 'REQUEST', at, 'Europe/Istanbul'),
      ).toBe('KNT-2031-000001');
      expect(
        await numbering.next(t.prisma, a.municipalityId, 'REQUEST', at, 'Europe/Istanbul'),
      ).toBe('KNT-2031-000002');
      expect(
        await numbering.next(t.prisma, b.municipalityId, 'REQUEST', at, 'Europe/Istanbul'),
      ).toBe('KNT-2031-000001');
      // New year in Istanbul, still the old year in UTC.
      const newYear = new Date('2031-12-31T21:30:00Z');
      expect(
        await numbering.next(t.prisma, a.municipalityId, 'REQUEST', newYear, 'Europe/Istanbul'),
      ).toBe('KNT-2032-000001');
    });
  });

  // ─── Access scope ────────────────────────────────────────────────────

  describe('access scope', () => {
    it('lets citizens read only their own requests', async () => {
      await t.http().get(`/api/v1/requests/${ids.first}`).set(auth.citizen).expect(200);
      const denied = await t
        .http()
        .get(`/api/v1/requests/${ids.first}`)
        .set(auth.citizen2)
        .expect(404);
      expect(denied.body.code).toBe('REQUEST_NOT_FOUND');
      const list = await t
        .http()
        .get('/api/v1/requests?pageSize=100&departmentId=' + ids.works)
        .set(auth.citizen2)
        .expect(200);
      expect(list.body.meta.total).toBe(0);
    });

    it('limits department managers to their department', async () => {
      const own = await t
        .http()
        .get(`/api/v1/requests/${ids.first}`)
        .set(auth.managerWorks)
        .expect(200);
      expect(own.body.data.timeline[0].performedBy).toMatch(/citizen/); // staff see who did what
      await t.http().get(`/api/v1/requests/${ids.first}`).set(auth.managerParks).expect(404);
      const list = await t
        .http()
        .get('/api/v1/requests?pageSize=100')
        .set(auth.managerParks)
        .expect(200);
      expect(
        list.body.data.every((r: { department: { id: string } }) => r.department.id === ids.parks),
      ).toBe(true);
    });

    it('gives the municipality admin every request and the reporter contact', async () => {
      const res = await t.http().get(`/api/v1/requests/${ids.first}`).set(auth.admin).expect(200);
      expect(res.body.data.reporter).toMatchObject({
        id: ids.citizen,
        email: a.users.citizen.email,
      });
    });

    it('answers 404 across municipalities and 403 without request permissions', async () => {
      await t.http().get(`/api/v1/requests/${ids.first}`).set(auth.bAdmin).expect(404);
      const bList = await t
        .http()
        .get('/api/v1/requests?pageSize=100')
        .set(auth.bAdmin)
        .expect(200);
      expect(bList.body.data.map((r: { id: string }) => r.id)).not.toContain(ids.first);
      await t.http().get('/api/v1/requests').set(auth.field).expect(403);
    });
  });

  // ─── Listing ─────────────────────────────────────────────────────────

  describe('listing', () => {
    beforeAll(async () => {
      // Rows with backdated timestamps for SLA filters (inserted directly; the API always uses "now").
      const now = Date.now();
      const row = (
        label: string,
        createdMinAgo: number,
        slaMin: number,
        resolvedMinAgo?: number,
      ) => {
        const createdAt = new Date(now - createdMinAgo * 60_000);
        const slaDueAt = new Date(createdAt.getTime() + slaMin * 60_000);
        return t.prisma.request.create({
          data: {
            municipalityId: a.municipalityId,
            publicNumber: `TST-${run}-${label}`,
            createdById: ids.citizen,
            categoryId: ids.pothole,
            departmentId: ids.works,
            title: 'SLA',
            description: `SLAFILTER${run} ${label}`,
            latitude: 36.01,
            longitude: 36.01,
            createdAt,
            slaDueAt,
            slaAtRiskAt: new Date(slaDueAt.getTime() - slaMin * 0.25 * 60_000),
            ...(resolvedMinAgo !== undefined && {
              status: 'RESOLVED' as const,
              resolvedAt: new Date(now - resolvedMinAgo * 60_000),
            }),
          },
        });
      };
      await row('ontime', 10, 240);
      await row('atrisk', 200, 240);
      await row('breached', 300, 240);
      await row('late', 600, 240, 100); // resolved after its deadline
      await row('met', 600, 240, 500); // resolved in time
    });

    const codesFor = async (query: string) => {
      const res = await t
        .http()
        .get(`/api/v1/requests?search=SLAFILTER${run}&pageSize=100&${query}`)
        .set(auth.admin)
        .expect(200);
      return res.body.data
        .map((r: { publicNumber: string }) => r.publicNumber.split('-').at(-1))
        .sort();
    };

    it('filters by computed SLA status, freezing finished requests', async () => {
      expect(await codesFor('slaStatus=ON_TIME')).toEqual(['met', 'ontime']);
      expect(await codesFor('slaStatus=AT_RISK')).toEqual(['atrisk']);
      expect(await codesFor('slaStatus=BREACHED')).toEqual(['breached', 'late']);
    });

    it('filters by status, priority, category (with sub-categories), department, neighbourhood, source and date', async () => {
      const q = async (query: string) =>
        (await t.http().get(`/api/v1/requests?pageSize=100&${query}`).set(auth.admin).expect(200))
          .body;
      expect(
        (await q('status=RESOLVED')).data.every((r: { status: string }) => r.status === 'RESOLVED'),
      ).toBe(true);
      expect(
        (await q('priority=HIGH,CRITICAL')).data.every((r: { priority: string }) =>
          ['HIGH', 'CRITICAL'].includes(r.priority),
        ),
      ).toBe(true);
      const byRoot = await q(`categoryId=${ids.road}`);
      expect(
        byRoot.data.some((r: { category: { id: string } }) => r.category.id === ids.pothole),
      ).toBe(true);
      expect(
        (await q(`departmentId=${ids.parks}`)).data.every(
          (r: { department: { id: string } }) => r.department.id === ids.parks,
        ),
      ).toBe(true);
      expect((await q('source=MUNICIPAL_STAFF')).meta.total).toBeGreaterThanOrEqual(1);
      expect(
        (await q(`createdFrom=${new Date(Date.now() + 86_400_000).toISOString()}`)).meta.total,
      ).toBe(0);
      const nb = await q(
        `neighborhoodId=${(await t.prisma.neighborhood.findFirstOrThrow({ where: { municipalityId: a.municipalityId, code: 'NB1' } })).id}`,
      );
      expect(
        nb.data.every((r: { neighborhood: { code: string } }) => r.neighborhood.code === 'NB1'),
      ).toBe(true);
    });

    it('searches by exact public number and by text', async () => {
      const first = (await t.http().get(`/api/v1/requests/${ids.first}`).set(auth.admin)).body.data
        .publicNumber as string;
      const byNumber = await t
        .http()
        .get(`/api/v1/requests?search=${first.toLowerCase()}`)
        .set(auth.admin)
        .expect(200);
      expect(byNumber.body.data.map((r: { publicNumber: string }) => r.publicNumber)).toEqual([
        first,
      ]);
      expect((await codesFor('')).length).toBe(5);
    });

    it('paginates newest first and guards page size and sorting', async () => {
      const res = await t
        .http()
        .get('/api/v1/requests?pageSize=2&page=1')
        .set(auth.citizen)
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(Date.parse(res.body.data[0].createdAt)).toBeGreaterThanOrEqual(
        Date.parse(res.body.data[1].createdAt),
      );
      expect(res.body.meta.totalPages).toBeGreaterThan(1);
      await t.http().get('/api/v1/requests?pageSize=101').set(auth.admin).expect(400);
      await t.http().get('/api/v1/requests?sort=description').set(auth.admin).expect(400);
      await t.http().get('/api/v1/requests?sort=-slaDueAt,priority').set(auth.admin).expect(200);
    });

    it('supports "mine" for staff and cannot widen a citizen’s scope', async () => {
      const mine = await t
        .http()
        .get('/api/v1/requests?mine=true&pageSize=100')
        .set(auth.admin)
        .expect(200);
      expect(mine.body.data.every((r: { source: string }) => r.source === 'MUNICIPAL_STAFF')).toBe(
        true,
      );
      const citizen = await t
        .http()
        .get('/api/v1/requests?pageSize=100')
        .set(auth.citizen)
        .expect(200);
      const total = citizen.body.meta.total;
      const tried = await t
        .http()
        .get(`/api/v1/requests?pageSize=100&mine=false&departmentId=${ids.parks}`)
        .set(auth.citizen2)
        .expect(200);
      expect(tried.body.meta.total).toBe(0);
      expect(total).toBeGreaterThan(25);
    });
  });

  // ─── Workflow ────────────────────────────────────────────────────────

  describe('workflow', () => {
    let id: string;
    beforeAll(async () => {
      id = (await create('citizen', pothole()).expect(201)).body.data.id;
    });

    const move = (who: string, to: string, reason?: string) =>
      t
        .http()
        .post(`/api/v1/requests/${id}/transitions`)
        .set(auth[who])
        .send({ to, ...(reason && { reason }) });

    it('refuses invalid and system-only transitions with the allowed targets', async () => {
      const res = await move('managerWorks', 'CLOSED').expect(409);
      expect(res.body).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
        details: { from: 'NEW', to: 'CLOSED', allowed: ['UNDER_REVIEW', 'REJECTED'] },
      });
      await move('managerWorks', 'AI_ANALYZED').expect(409);
      await move('citizen', 'UNDER_REVIEW').expect(403);
      await move('managerParks', 'UNDER_REVIEW').expect(404); // outside their department
    });

    it('moves NEW → UNDER_REVIEW → ASSIGNED_TO_DEPARTMENT with timeline and audit', async () => {
      const detail = (await t.http().get(`/api/v1/requests/${id}`).set(auth.managerWorks)).body
        .data;
      expect(detail.actions.transitions.map((x: { to: string }) => x.to)).toEqual([
        'UNDER_REVIEW',
        'REJECTED',
      ]);
      await move('managerWorks', 'UNDER_REVIEW').expect(200);
      const res = await move('managerWorks', 'ASSIGNED_TO_DEPARTMENT').expect(200);
      expect(res.body.data.status).toBe('ASSIGNED_TO_DEPARTMENT');
      const changes = res.body.data.timeline.filter(
        (e: { type: string }) => e.type === 'STATUS_CHANGED',
      );
      expect(changes.map((e: { description: string }) => e.description)).toEqual([
        'Durum: Yeni → İncelemede',
        'Durum: İncelemede → Müdürlüğe Atandı',
      ]);
      const audits = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.REQUEST_STATUS_CHANGED, entityId: id },
      });
      expect(audits).toHaveLength(2);
    });

    it('changes priority (staff only) and records it', async () => {
      await t
        .http()
        .patch(`/api/v1/requests/${id}/priority`)
        .set(auth.citizen)
        .send({ priority: 'CRITICAL' })
        .expect(403);
      const res = await t
        .http()
        .patch(`/api/v1/requests/${id}/priority`)
        .set(auth.managerWorks)
        .send({ priority: 'CRITICAL', reason: 'Okul önü' })
        .expect(200);
      expect(res.body.data.priority).toBe('CRITICAL');
      expect(res.body.data.timeline.at(-1)).toMatchObject({
        type: 'PRIORITY_CHANGED',
        description: 'Öncelik: Yüksek → Kritik – Gerekçe: Okul önü',
      });
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.REQUEST_PRIORITY_CHANGED, entityId: id },
        }),
      ).toBe(1);
    });

    it('re-routes to an active department only, keeping the SLA', async () => {
      const before = (await t.http().get(`/api/v1/requests/${id}`).set(auth.admin)).body.data;
      await t
        .http()
        .patch(`/api/v1/requests/${id}/department`)
        .set(auth.admin)
        .send({ departmentId: ids.closing })
        .expect(409);
      const res = await t
        .http()
        .patch(`/api/v1/requests/${id}/department`)
        .set(auth.admin)
        .send({ departmentId: ids.parks })
        .expect(200);
      expect(res.body.data.department.id).toBe(ids.parks);
      expect(res.body.data.sla.dueAt).toBe(before.sla.dueAt);
      await t.http().get(`/api/v1/requests/${id}`).set(auth.managerWorks).expect(404);
      await t.http().get(`/api/v1/requests/${id}`).set(auth.managerParks).expect(200);
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.REQUEST_DEPARTMENT_CHANGED, entityId: id },
        }),
      ).toBe(1);
    });

    it('rejects only with a reason; a rejected request is final', async () => {
      const other = (await create('citizen', pothole()).expect(201)).body.data.id;
      const noReason = await t
        .http()
        .post(`/api/v1/requests/${other}/transitions`)
        .set(auth.managerWorks)
        .send({ to: 'REJECTED' })
        .expect(400);
      expect(noReason.body.code).toBe('TRANSITION_REASON_REQUIRED');
      const res = await t
        .http()
        .post(`/api/v1/requests/${other}/transitions`)
        .set(auth.managerWorks)
        .send({ to: 'REJECTED', reason: 'Mükerrer bildirim' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Mükerrer bildirim',
        sla: { status: null },
      });
      expect(res.body.data.actions).toMatchObject({
        transitions: [],
        canChangePriority: false,
        canAddMedia: false,
      });
      await t
        .http()
        .post(`/api/v1/requests/${other}/transitions`)
        .set(auth.managerWorks)
        .send({ to: 'UNDER_REVIEW' })
        .expect(409);
      await t
        .http()
        .patch(`/api/v1/requests/${other}/priority`)
        .set(auth.managerWorks)
        .send({ priority: 'LOW' })
        .expect(409);
    });
  });

  // ─── Media ───────────────────────────────────────────────────────────

  describe('media', () => {
    let id: string;
    beforeAll(async () => {
      id = (await create('citizen', pothole()).expect(201)).body.data.id;
    });
    const upload = (
      who: string,
      files: { buffer: Buffer; name: string; type: string }[],
      target = id,
    ) => {
      let req = t.http().post(`/api/v1/requests/${target}/media`).set(auth[who]);
      for (const f of files)
        req = req.attach('files', f.buffer, { filename: f.name, contentType: f.type });
      return req;
    };

    const IMAGES = {} as Record<'jpeg' | 'png' | 'webp' | 'exifJpeg', Buffer>;
    beforeAll(async () => {
      IMAGES.jpeg = await plainImage('jpeg');
      IMAGES.png = await pngWithMetadata();
      IMAGES.webp = await webpWithMetadata();
      IMAGES.exifJpeg = await jpegWithMetadata();
    });

    it('stores JPEG, PNG and WEBP privately under server-generated keys, without metadata', async () => {
      const res = await upload('citizen', [
        { buffer: IMAGES.exifJpeg, name: '../../etc/passwd.jpg', type: 'image/jpeg' },
        { buffer: IMAGES.png, name: 'foto.png', type: 'image/png' },
        { buffer: IMAGES.webp, name: 'x.webp', type: 'image/webp' },
      ]).expect(201);
      expect(res.body.data.map((m: { mimeType: string }) => m.mimeType)).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);

      const rows = await t.prisma.requestMedia.findMany({
        where: { requestId: id },
        orderBy: { createdAt: 'asc' },
      });
      for (const row of rows) {
        expect(row.storageKey).toMatch(
          new RegExp(
            `^municipalities/${a.municipalityId}/requests/${id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
          ),
        );
        expect(row.storageKey).not.toMatch(/passwd|\.\.|foto/);
        expect(row.url).toBeNull();
      }

      // The presigned URL works; the same object without a signature is refused (private bucket).
      for (const [i, media] of (res.body.data as { url: string; mimeType: string }[]).entries()) {
        const ok = await fetch(media.url);
        expect(ok.status).toBe(200);
        expect(ok.headers.get('content-type')).toBe(media.mimeType);
        const stored = Buffer.from(await ok.arrayBuffer());
        // What is stored is the re-encoded image: decodable, same format, no EXIF/GPS/XMP.
        expect(stored.length).toBe(rows[i].sizeBytes);
        expect((await sharp(stored).metadata()).format).toBe(media.mimeType.split('/')[1]);
        expect(await metadataTraces(stored)).toEqual([]);
      }
      const signed = res.body.data[0].url as string;
      expect(new URL(signed).pathname.startsWith('/kent360-media-test/')).toBe(true);
      // EXIF Orientation 6 was applied to the pixels: 40×20 stored → 20×40 upright.
      const upright = await sharp(
        Buffer.from(await (await fetch(signed)).arrayBuffer()),
      ).metadata();
      expect([upright.width, upright.height]).toEqual([20, 40]);
      expect((await fetch(signed.split('?')[0])).status).toBe(403);
      expect(Date.parse(res.body.data[0].urlExpiresAt) - Date.now()).toBeLessThanOrEqual(300_000);

      const detail = (await t.http().get(`/api/v1/requests/${id}`).set(auth.citizen)).body.data;
      expect(detail.media).toHaveLength(3);
      expect(detail.timeline.at(-1)).toMatchObject({
        type: 'MEDIA_ADDED',
        description: '3 fotoğraf eklendi.',
      });
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.REQUEST_MEDIA_ADDED, entityId: id },
        }),
      ).toBe(1);
    });

    it('decides the type by file signature, not by name or declared type', async () => {
      const gifBytes = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64, 4)]);
      const gif = await upload('citizen', [
        { buffer: gifBytes, name: 'a.gif', type: 'image/gif' },
      ]).expect(415);
      expect(gif.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      await upload('citizen', [{ buffer: gifBytes, name: 'spoof.jpg', type: 'image/jpeg' }]).expect(
        415,
      );
      await upload('citizen', [
        { buffer: IMAGES.png, name: 'mismatch.jpg', type: 'image/jpeg' },
      ]).expect(415);
      await upload('citizen', [
        { buffer: Buffer.from('<script>alert(1)</script>'), name: 'x.png', type: 'image/png' },
      ]).expect(415);
    });

    it('rejects corrupt, animated and oversized-dimension images before storing anything', async () => {
      const corrupt = await upload('citizen', [
        { buffer: await corruptJpeg(), name: 'broken.jpg', type: 'image/jpeg' },
      ]).expect(400);
      expect(corrupt.body.code).toBe('INVALID_IMAGE');
      const animated = await upload('citizen', [
        { buffer: await animatedWebp(), name: 'anim.webp', type: 'image/webp' },
      ]).expect(415);
      expect(animated.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      // A valid first file does not get stored when a later one fails.
      const huge = await upload('citizen', [
        { buffer: IMAGES.jpeg, name: 'ok.jpg', type: 'image/jpeg' },
        { buffer: hugeDimensionPng(), name: 'bomb.png', type: 'image/png' },
      ]).expect(413);
      expect(huge.body).toMatchObject({
        code: 'IMAGE_DIMENSIONS_TOO_LARGE',
        details: { index: 1, width: 20_000, height: 20_000 },
      });
      expect(await t.prisma.requestMedia.count({ where: { requestId: id } })).toBe(3);
    });

    it('rejects oversized files and more than five photos per request', async () => {
      const big = Buffer.concat([IMAGES.jpeg, Buffer.alloc(10 * 1024 * 1024)]);
      const res = await upload('citizen', [
        { buffer: big, name: 'big.jpg', type: 'image/jpeg' },
      ]).expect(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
      const limit = await upload('citizen', [
        { buffer: IMAGES.jpeg, name: '4.jpg', type: 'image/jpeg' },
        { buffer: IMAGES.jpeg, name: '5.jpg', type: 'image/jpeg' },
        { buffer: IMAGES.jpeg, name: '6.jpg', type: 'image/jpeg' },
      ]).expect(409);
      expect(limit.body.code).toBe('MEDIA_LIMIT_REACHED');
      expect(await t.prisma.requestMedia.count({ where: { requestId: id } })).toBe(3);
    });

    it('protects media like the request itself', async () => {
      const mediaId = (await t.prisma.requestMedia.findFirstOrThrow({ where: { requestId: id } }))
        .id;
      await upload('citizen2', [{ buffer: IMAGES.jpeg, name: 'x.jpg', type: 'image/jpeg' }]).expect(
        404,
      );
      await upload('bAdmin', [{ buffer: IMAGES.jpeg, name: 'x.jpg', type: 'image/jpeg' }]).expect(
        404,
      );
      await t
        .http()
        .get(`/api/v1/requests/${id}/media/${mediaId}/url`)
        .set(auth.citizen2)
        .expect(404);
      await t
        .http()
        .get(`/api/v1/requests/${id}/media/${mediaId}/url`)
        .set(auth.bAdmin)
        .expect(404);
      await t
        .http()
        .get(`/api/v1/requests/${id}/media/${mediaId}/url`)
        .set(auth.managerParks)
        .expect(404);
      const ok = await t
        .http()
        .get(`/api/v1/requests/${id}/media/${mediaId}/url`)
        .set(auth.managerWorks)
        .expect(200);
      expect(ok.body.data.url).toContain('X-Amz-Signature');
      // A media id of another request cannot be fetched through this one.
      const other = (await create('citizen', pothole()).expect(201)).body.data.id;
      await t
        .http()
        .get(`/api/v1/requests/${other}/media/${mediaId}/url`)
        .set(auth.citizen)
        .expect(404);
    });
  });
});
