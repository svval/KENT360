import { randomUUID } from 'node:crypto';
import { RoleCode } from '@kent360/shared-types';
import { SlaAlertsService } from '../src/modules/notifications/sla-alerts.service';
import {
  addUser,
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

const HOUR = 3_600_000;

describe('Notifications, reports and audit (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const auth: Record<string, ReturnType<typeof bearer>> = {};
  const ids: Record<string, string> = {};
  const run = randomUUID().slice(0, 6);
  let seq = 0;

  const get = (who: string, path: string) => t.http().get(`/api/v1${path}`).set(auth[who]);
  const post = (who: string, path: string, body: object = {}) =>
    t.http().post(`/api/v1${path}`).set(auth[who]).send(body);
  const patch = (who: string, path: string, body: object = {}) =>
    t.http().patch(`/api/v1${path}`).set(auth[who]).send(body);

  /** A request written directly (SLA times and created_at are immutable through the API). */
  const rawRequest = async (data: {
    tenant?: TenantFixture;
    department: string;
    category: string;
    priority?: string;
    status?: string;
    slaDueAt?: Date;
    address?: string;
  }) => {
    seq += 1;
    const tenant = data.tenant ?? a;
    const row = await t.prisma.request.create({
      data: {
        municipalityId: tenant.municipalityId,
        publicNumber: `KNT-2026-7${run.replace(/\D/g, '3').slice(0, 2)}${String(seq).padStart(3, '0')}`,
        title: `Rapor testi ${seq}`,
        description: `Console test ${run}`,
        categoryId: data.category,
        departmentId: data.department,
        status: (data.status ?? 'NEW') as never,
        priority: (data.priority ?? 'NORMAL') as never,
        latitude: 36.1,
        longitude: 36.1,
        address: data.address ?? null,
        slaDueAt: data.slaDueAt ?? null,
        slaAtRiskAt: data.slaDueAt ? new Date(data.slaDueAt.getTime() - HOUR) : null,
        ...(data.slaDueAt && { createdAt: new Date(data.slaDueAt.getTime() - 24 * HOUR) }),
      },
    });
    return row;
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Konsol');
    b = await createTenant(t.prisma, 'Konsolb');
    const p = t.prisma;
    const works = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'WORKS', name: 'Fen İşleri' },
    });
    const cleaning = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'CLEANING', name: 'Temizlik İşleri' },
    });
    const bWorks = await p.department.create({
      data: { municipalityId: b.municipalityId, code: 'WORKS', name: 'Öte Fen' },
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
        defaultSlaMinutes: 1440,
      },
    });
    const garbage = await p.requestCategory.create({
      data: {
        municipalityId: a.municipalityId,
        code: 'GARBAGE',
        name: 'Çöp',
        departmentId: cleaning.id,
      },
    });
    const bCat = await p.requestCategory.create({
      data: {
        municipalityId: b.municipalityId,
        code: 'OTHER',
        name: 'Öte',
        departmentId: bWorks.id,
      },
    });
    Object.assign(ids, {
      works: works.id,
      cleaning: cleaning.id,
      road: road.id,
      pothole: pothole.id,
      garbage: garbage.id,
      bWorks: bWorks.id,
      bCat: bCat.id,
    });
    await p.user.update({ where: { id: a.users.manager.id }, data: { departmentId: works.id } });
    const cleaningManager = await addUser(
      p,
      a.municipalityId,
      'cleanmgr',
      RoleCode.DEPARTMENT_MANAGER,
      cleaning.id,
    );
    ids.cleaningManager = cleaningManager.id;
    for (const [who, user] of Object.entries({
      ...a.users,
      cleaningManager,
      bAdmin: b.users.admin,
    })) {
      if (who !== 'disabled') auth[who] = bearer((await login(t, user.email)).accessToken);
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  // ─── Notifications ──────────────────────────────────────────────────────

  describe('notifications', () => {
    beforeAll(async () => {
      const res = await post('citizen', '/requests', {
        categoryId: ids.pothole,
        description: 'Evin önündeki yolda büyük bir çukur var.',
        latitude: 36.1,
        longitude: 36.1,
        address: 'Test sokak 1',
      }).expect(201);
      ids.citizenRequest = res.body.data.id;
      ids.citizenRequestNumber = res.body.data.publicNumber;
    });

    it('routes a new request to the managers of its department only', async () => {
      const mine = await get('manager', '/notifications').expect(200);
      const assigned = mine.body.data.find(
        (n: { type: string; entityId: string }) =>
          n.type === 'REQUEST_ASSIGNED' && n.entityId === ids.citizenRequest,
      );
      expect(assigned).toMatchObject({
        title: `Yeni talep: ${ids.citizenRequestNumber}`,
        entityType: 'Request',
        readAt: null,
      });
      expect(Object.keys(assigned).sort()).toEqual(
        ['createdAt', 'entityId', 'entityType', 'id', 'message', 'readAt', 'title', 'type'].sort(),
      );
      ids.managerNotification = assigned.id;
      const other = await get('cleaningManager', '/notifications').expect(200);
      expect(other.body.data).toHaveLength(0);
      // The reporter is not notified about their own action.
      const citizen = await get('citizen', '/notifications').expect(200);
      expect(citizen.body.data).toHaveLength(0);
    });

    it('tells the citizen about status changes in citizen words', async () => {
      await post('manager', `/requests/${ids.citizenRequest}/transitions`, {
        to: 'UNDER_REVIEW',
      }).expect(200);
      const res = await get('citizen', '/notifications').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        type: 'REQUEST_UPDATED',
        entityId: ids.citizenRequest,
      });
      expect(res.body.data[0].message).toContain('İncelemede');
      expect(res.body.meta.unreadCount).toBe(1);
      ids.citizenNotification = res.body.data[0].id;
    });

    it('never shows internal notification types to a citizen', async () => {
      await t.prisma.notification.create({
        data: {
          municipalityId: a.municipalityId,
          userId: a.users.citizen.id,
          type: 'SLA_BREACHED',
          title: 'internal',
          body: 'internal',
        },
      });
      const res = await get('citizen', '/notifications').expect(200);
      expect(res.body.data.map((n: { title: string }) => n.title)).not.toContain('internal');
      expect(res.body.meta).toMatchObject({ total: 1, unreadCount: 1 });
    });

    it('does not leak notifications of other users or municipalities (404)', async () => {
      await patch('manager', `/notifications/${ids.citizenNotification}/read`).expect(404);
      await patch('bAdmin', `/notifications/${ids.citizenNotification}/read`).expect(404);
      await patch('citizen', `/notifications/${randomUUID()}/read`).expect(404);
      const still = await get('citizen', '/notifications?unread=true').expect(200);
      expect(still.body.data).toHaveLength(1);
    });

    it('marks one as read, idempotently', async () => {
      const first = await patch('citizen', `/notifications/${ids.citizenNotification}/read`).expect(
        200,
      );
      expect(first.body.data.readAt).not.toBeNull();
      const again = await patch('citizen', `/notifications/${ids.citizenNotification}/read`).expect(
        200,
      );
      expect(again.body.data.readAt).toBe(first.body.data.readAt);
      const res = await get('citizen', '/notifications').expect(200);
      expect(res.body.meta.unreadCount).toBe(0);
    });

    it('paginates and marks everything read', async () => {
      await t.prisma.notification.createMany({
        data: [1, 2, 3].map((i) => ({
          municipalityId: a.municipalityId,
          userId: a.users.manager.id,
          type: 'SYSTEM' as const,
          title: `Sistem ${i}`,
          body: 'x',
          createdAt: new Date(Date.now() - i * HOUR),
        })),
      });
      const page = await get('manager', '/notifications?pageSize=2&page=2').expect(200);
      expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 4, totalPages: 2 });
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta.unreadCount).toBe(4);
      const all = await post('manager', '/notifications/read-all').expect(200);
      expect(all.body.data.updated).toBe(4);
      const after = await get('manager', '/notifications?unread=true').expect(200);
      expect(after.body.data).toHaveLength(0);
      expect(after.body.meta.unreadCount).toBe(0);
      // Other users' inboxes are untouched.
      const citizen = await t.prisma.notification.count({
        where: { userId: a.users.citizen.id, readAt: null },
      });
      expect(citizen).toBe(1); // the hidden internal one
    });

    it('alerts managers (and admins on a breach) once per SLA event', async () => {
      const sweeper = t.app.get(SlaAlertsService);
      const breached = await rawRequest({
        department: ids.works,
        category: ids.pothole,
        slaDueAt: new Date(Date.now() - HOUR),
      });
      const atRisk = await rawRequest({
        department: ids.works,
        category: ids.pothole,
        slaDueAt: new Date(Date.now() + HOUR / 2),
      });
      await rawRequest({
        tenant: b,
        department: ids.bWorks,
        category: ids.bCat,
        slaDueAt: new Date(Date.now() - 30 * 24 * HOUR), // older than the look-back
      });
      await sweeper.sweep();
      const count = (userId: string, type: string, entityId: string) =>
        t.prisma.notification.count({ where: { userId, type: type as never, entityId } });
      expect(await count(a.users.manager.id, 'SLA_BREACHED', breached.id)).toBe(1);
      expect(await count(a.users.admin.id, 'SLA_BREACHED', breached.id)).toBe(1);
      expect(await count(a.users.manager.id, 'SLA_AT_RISK', atRisk.id)).toBe(1);
      expect(await count(a.users.admin.id, 'SLA_AT_RISK', atRisk.id)).toBe(0);
      expect(await count(ids.cleaningManager, 'SLA_BREACHED', breached.id)).toBe(0);
      await sweeper.sweep();
      expect(await count(a.users.manager.id, 'SLA_BREACHED', breached.id)).toBe(1);
    });
  });

  // ─── Reports ────────────────────────────────────────────────────────────

  describe('reports', () => {
    beforeAll(async () => {
      await rawRequest({
        department: ids.works,
        category: ids.pothole,
        priority: 'CRITICAL',
        address: '=HYPERLINK("http://evil.test","tıkla")',
      });
      await rawRequest({ department: ids.cleaning, category: ids.garbage, address: '@SUM(A1)' });
      await rawRequest({ tenant: b, department: ids.bWorks, category: ids.bCat });
    });

    const total = async (who: string, query = '') =>
      (await get(who, `/reports/summary${query}`).expect(200)).body.data.totals.requests as number;

    it('admin sees the municipality, a manager only their department', async () => {
      const all = await t.prisma.request.count({ where: { municipalityId: a.municipalityId } });
      const works = await t.prisma.request.count({
        where: { municipalityId: a.municipalityId, departmentId: ids.works },
      });
      expect(await total('admin')).toBe(all);
      expect(await total('manager')).toBe(works);
      // A manager cannot widen the scope with a filter.
      expect(await total('manager', `?departmentId=${ids.cleaning}`)).toBe(0);
      const res = await get('manager', '/reports/summary').expect(200);
      expect(res.body.data.departments.map((d: { id: string }) => d.id)).toEqual([ids.works]);
    });

    it('keeps tenants apart', async () => {
      // B has one request in the default 30-day window (its other one is older).
      expect(await total('bAdmin')).toBe(1);
      const csv = await get('bAdmin', '/reports/requests.csv').expect(200);
      expect(csv.text).not.toContain('HYPERLINK');
    });

    it('applies filters (parent category covers children, priority)', async () => {
      const works = await t.prisma.request.count({
        where: { municipalityId: a.municipalityId, categoryId: ids.pothole },
      });
      expect(await total('admin', `?categoryId=${ids.road}`)).toBe(works);
      expect(await total('admin', '?priority=CRITICAL')).toBe(1);
      expect(await total('admin', '?dateFrom=2000-01-01&dateTo=2000-01-31')).toBe(0);
      await get('admin', '/reports/summary?dateFrom=2026-10-05&dateTo=2026-10-01').expect(400);
      await get('admin', '/reports/summary?status=NOPE').expect(400);
    });

    it('exports UTF-8 BOM CSV with a meaningful file name and no formula injection', async () => {
      const res = await get('admin', '/reports/requests.csv')
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="kent360-talep-raporu-\d{4}-\d{2}-\d{2}\.csv"/,
      );
      const bytes = res.body as Buffer;
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = bytes.toString('utf8');
      expect(text).toContain('Talep No;Oluşturulma;Durum;Öncelik');
      expect(text).toContain(`"'=HYPERLINK(""http://evil.test"",""tıkla"")"`);
      expect(text).toContain("'@SUM(A1)");
      expect(text).not.toMatch(/;=HYPERLINK/);
      expect(text).not.toContain('Console test'); // no free-text description
    });

    it.each(['work-orders', 'sla', 'departments', 'neighborhoods'])(
      'exports %s.csv',
      async (type) => {
        const res = await get('admin', `/reports/${type}.csv`).expect(200);
        expect(res.headers['content-disposition']).toContain('kent360-');
        expect(res.text.split('\r\n')[0]).toContain(';');
      },
    );

    it('manager CSV contains only their department', async () => {
      const res = await get('manager', '/reports/departments.csv').expect(200);
      expect(res.text).toContain('Fen İşleri');
      expect(res.text).not.toContain('Temizlik İşleri');
    });

    it('forbids citizens and field staff; unknown files are 404', async () => {
      await get('citizen', '/reports/summary').expect(403);
      await get('citizen', '/reports/requests.csv').expect(403);
      await get('field', '/reports/requests.csv').expect(403);
      await get('admin', '/reports/passwords.csv').expect(404);
    });
  });

  // ─── Audit ──────────────────────────────────────────────────────────────

  describe('audit', () => {
    it('lists the own municipality with readable, sanitised changes', async () => {
      const res = await get('admin', '/audit?pageSize=100').expect(200);
      expect(res.body.meta.total).toBeGreaterThan(0);
      const created = res.body.data.find(
        (e: { action: string; entityId: string }) =>
          e.action === 'REQUEST_CREATED' && e.entityId === ids.citizenRequest,
      );
      expect(created.actor.email).toBe(a.users.citizen.email);
      expect(created.changes).toEqual(
        expect.arrayContaining([
          { field: 'publicNumber', before: null, after: ids.citizenRequestNumber },
        ]),
      );
      const raw = JSON.stringify(res.body);
      for (const forbidden of [
        'password',
        'Hash',
        'token',
        'sessionId',
        'userAgent',
        'beforeData',
        'afterData',
        'REDACTED',
      ]) {
        expect(raw).not.toContain(forbidden);
      }
    });

    it('filters by action, entity, user and date', async () => {
      const byAction = await get('admin', '/audit?action=REQUEST_STATUS_CHANGED').expect(200);
      expect(byAction.body.data.length).toBeGreaterThan(0);
      expect(
        byAction.body.data.every((e: { action: string }) => e.action === 'REQUEST_STATUS_CHANGED'),
      ).toBe(true);
      const byEntity = await get(
        'admin',
        `/audit?entityType=Request&entityId=${ids.citizenRequest}`,
      ).expect(200);
      expect(byEntity.body.data.map((e: { action: string }) => e.action).sort()).toEqual(
        expect.arrayContaining(['REQUEST_CREATED', 'REQUEST_STATUS_CHANGED']),
      );
      const byUser = await get(
        'admin',
        `/audit?user=${encodeURIComponent(a.users.manager.email)}`,
      ).expect(200);
      expect(byUser.body.data.length).toBeGreaterThan(0);
      expect(
        byUser.body.data.every((e: { actor: { id: string } }) => e.actor.id === a.users.manager.id),
      ).toBe(true);
      const old = await get('admin', '/audit?dateFrom=2000-01-01&dateTo=2000-01-02').expect(200);
      expect(old.body.data).toHaveLength(0);
      await get('admin', '/audit?action=DROP_TABLE').expect(400);
    });

    it('requires audit.read and keeps municipalities apart', async () => {
      await get('manager', '/audit').expect(403);
      await get('citizen', '/audit').expect(403);
      await get('field', '/audit').expect(403);
      const other = await get('bAdmin', `/audit?entityId=${ids.citizenRequest}`).expect(200);
      expect(other.body.data).toHaveLength(0);
    });
  });
});
