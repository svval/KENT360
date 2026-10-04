import { randomUUID } from 'node:crypto';
import { AuditAction, RoleCode } from '@kent360/shared-types';
import {
  addUser,
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

const MINUTE = 60_000;
const DAY = 86_400_000;
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
/** Moves a point north by `meters` (≈ 111 320 m per degree of latitude). */
const north = (lat: number, meters: number) => lat + meters / 111_320;

describe('MahallePulse and AI analysis (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const auth: Record<string, ReturnType<typeof bearer>> = {};
  const ids: Record<string, string> = {};
  const numbers: Record<string, string> = {};
  const now = Date.now();
  const run = randomUUID().slice(0, 6);
  const SPOT = { latitude: 36.005, longitude: 36.005 }; // inside N1 – duplicate fixtures
  const PULSE = { latitude: 36.002, longitude: 36.002 }; // inside N1, ~430 m from SPOT
  let seq = 0;

  const get = (who: string, path: string) => t.http().get(`/api/v1${path}`).set(auth[who]);
  const post = (who: string, path: string, body: object = {}) =>
    t.http().post(`/api/v1${path}`).set(auth[who]).send(body);

  /** A request written directly (created_at is immutable through the API). */
  const request = async (
    key: string,
    data: {
      tenant?: TenantFixture;
      category: string;
      department: string;
      neighborhood?: string | null;
      createdAt: number;
      status?: string;
      priority?: string;
      slaDueAt?: number;
      resolvedAt?: number;
      description?: string;
      latitude?: number;
      longitude?: number;
      createdById?: string;
    },
  ) => {
    seq += 1;
    const tenant = data.tenant ?? a;
    const publicNumber = `KNT-2026-8${run.replace(/\D/g, '2').slice(0, 2)}${String(seq).padStart(3, '0')}`;
    const row = await t.prisma.request.create({
      data: {
        municipalityId: tenant.municipalityId,
        publicNumber,
        title: key,
        description: data.description ?? `Pulse test ${key} ${run}`,
        categoryId: data.category,
        departmentId: data.department,
        neighborhoodId: data.neighborhood ?? null,
        status: (data.status ?? 'NEW') as never,
        priority: (data.priority ?? 'NORMAL') as never,
        latitude: data.latitude ?? PULSE.latitude,
        longitude: data.longitude ?? PULSE.longitude,
        createdAt: new Date(data.createdAt),
        createdById: data.createdById ?? null,
        slaDueAt: data.slaDueAt ? new Date(data.slaDueAt) : null,
        slaAtRiskAt: data.slaDueAt ? new Date(data.slaDueAt - MINUTE) : null,
        resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      },
    });
    ids[key] = row.id;
    numbers[key] = publicNumber;
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Pulse');
    b = await createTenant(t.prisma, 'Pulseb');
    const p = t.prisma;
    const dept = (m: string, code: string, name: string) =>
      p.department.create({ data: { municipalityId: m, code, name } });
    const works = await dept(a.municipalityId, 'WORKS', 'Fen İşleri');
    const cleaning = await dept(a.municipalityId, 'CLEANING', 'Temizlik İşleri');
    const bWorks = await dept(b.municipalityId, 'WORKS', 'Öte Fen');
    const cat = (m: string, data: object) =>
      p.requestCategory.create({ data: { municipalityId: m, ...data } as never });
    const road = await cat(a.municipalityId, {
      code: 'ROAD',
      name: 'Yol ve Kaldırım',
      departmentId: works.id,
      keywords: ['yol'],
    });
    const pothole = await cat(a.municipalityId, {
      code: 'POTHOLE',
      name: 'Yol Çukuru',
      parentId: road.id,
      departmentId: works.id,
      defaultPriority: 'HIGH',
      defaultSlaMinutes: 1440,
      keywords: ['çukur', 'göçük', 'asfalt'],
    });
    const sidewalk = await cat(a.municipalityId, {
      code: 'SIDEWALK',
      name: 'Kaldırım Bozukluğu',
      parentId: road.id,
      departmentId: works.id,
      keywords: ['kaldırım', 'parke'],
    });
    const garbage = await cat(a.municipalityId, {
      code: 'GARBAGE',
      name: 'Çöp Toplanmaması',
      departmentId: cleaning.id,
      keywords: ['çöp', 'konteyner'],
    });
    const bRoad = await cat(b.municipalityId, {
      code: 'POTHOLE',
      name: 'Öte Çukur',
      departmentId: bWorks.id,
      keywords: ['çukur'],
    });
    Object.assign(ids, {
      works: works.id,
      cleaning: cleaning.id,
      pothole: pothole.id,
      sidewalk: sidewalk.id,
      garbage: garbage.id,
      bWorks: bWorks.id,
      bPothole: bRoad.id,
    });

    await p.user.update({ where: { id: a.users.manager.id }, data: { departmentId: works.id } });
    const citizen2 = await addUser(p, a.municipalityId, 'citizen2', RoleCode.CITIZEN);
    for (const [who, user] of Object.entries({ ...a.users, citizen2, bAdmin: b.users.admin })) {
      if (who !== 'disabled') auth[who] = bearer((await login(t, user.email)).accessToken);
    }
    ids.citizen = a.users.citizen.id;

    const n1 = await post('admin', '/neighborhoods', {
      name: 'Karataş',
      code: `KAR_${run}`,
      geometry: box(36.0, 36.0, 36.01, 36.01),
    }).expect(201);
    const n2 = await post('admin', '/neighborhoods', {
      name: 'Güneykent',
      code: `GUN_${run}`,
      geometry: box(36.02, 36.02, 36.03, 36.03),
    }).expect(201);
    ids.n1 = n1.body.data.id;
    ids.n2 = n2.body.data.id;

    // N1 – Karataş: a pothole spike (4 in the last 7 days vs. 1 in the 4 weeks before).
    const n1Pothole = { category: pothole.id, department: works.id, neighborhood: ids.n1 };
    for (let i = 0; i < 4; i += 1) {
      await request(`spike${i}`, { ...n1Pothole, createdAt: now - (i + 1) * DAY });
    }
    await request('baseline', { ...n1Pothole, createdAt: now - 20 * DAY });
    await request('critical', {
      ...n1Pothole,
      createdAt: now - 2 * 3_600_000,
      priority: 'CRITICAL',
      slaDueAt: now + DAY,
    });
    await request('late', {
      ...n1Pothole,
      createdAt: now - 40 * DAY,
      status: 'CLOSED',
      slaDueAt: now - 39 * DAY,
      resolvedAt: now - 37 * DAY,
    }); // resolved late, 3 days
    await request('n1garbage', {
      category: garbage.id,
      department: cleaning.id,
      neighborhood: ids.n1,
      createdAt: now - 3 * DAY,
    });
    // N2 – Güneykent: only 2 recent garbage reports → below the minimum sample.
    for (let i = 0; i < 2; i += 1) {
      await request(`n2g${i}`, {
        category: garbage.id,
        department: cleaning.id,
        neighborhood: ids.n2,
        createdAt: now - (i + 1) * DAY,
        latitude: 36.025,
        longitude: 36.025,
      });
    }

    // Duplicate candidates around SPOT (outside the analytics neighbourhoods would also work).
    const dup = {
      category: pothole.id,
      department: works.id,
      neighborhood: ids.n1,
      longitude: SPOT.longitude,
    };
    await request('dupNear', {
      ...dup,
      createdAt: now - 3 * 3_600_000,
      latitude: north(SPOT.latitude, 40),
      description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
      createdById: a.users.citizen.id,
    });
    await request('dupOtherText', {
      ...dup,
      createdAt: now - 3 * 3_600_000,
      latitude: north(SPOT.latitude, 40),
      description: 'Belediye otobüs durağının camı kırılmış, yağmurda ıslanıyoruz.',
    });
    await request('dupFar', {
      ...dup,
      createdAt: now - 3 * 3_600_000,
      latitude: north(SPOT.latitude, 600),
      description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
    });
    await request('dupOld', {
      ...dup,
      createdAt: now - 45 * DAY,
      latitude: north(SPOT.latitude, 20),
      description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
    });
    await request('dupClosed', {
      ...dup,
      status: 'CLOSED',
      createdAt: now - 2 * DAY,
      latitude: north(SPOT.latitude, 10),
      description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
    });
    await request('dupOtherTenant', {
      tenant: b,
      category: bRoad.id,
      department: bWorks.id,
      createdAt: now - 3 * 3_600_000,
      ...SPOT,
      description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
    });
  });

  afterAll(async () => {
    await t.close();
  });

  // ─── MahallePulse ────────────────────────────────────────────────────

  describe('MahallePulse', () => {
    const pulseOf = async (who: string, id: string) =>
      (
        (await get(who, '/analytics/neighborhoods').expect(200)).body.data as {
          id: string;
          [key: string]: unknown;
        }[]
      ).find((n) => n.id === id);

    it('computes neighbourhood metrics with one aggregate per list', async () => {
      const n1 = await pulseOf('admin', ids.n1);
      expect(n1).toMatchObject({
        name: 'Karataş',
        total: 13, // 4 spike + baseline + critical + late + garbage + 5 duplicate fixtures
        resolved: 1,
        critical: 1,
        last7: 10, // spike×4, critical, garbage, dupNear, dupOtherText, dupFar, dupClosed
      });
      expect(n1?.open).toBe(11); // all but "late" and "dupClosed"
      expect(n1?.topCategory).toMatchObject({ name: 'Yol Çukuru' });
      expect(n1?.avgResolutionMinutes).toBe(3 * 1440);
      expect(n1?.riskScore).toEqual(expect.any(Number));
      expect(n1?.riskScore as number).toBeGreaterThanOrEqual(0);
      expect(n1?.riskScore as number).toBeLessThanOrEqual(100);
      expect(n1?.riskFactors).toHaveLength(5);
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(n1?.riskLevel);
    });

    it('sorts neighbourhoods by risk (choropleth values)', async () => {
      const list = (await get('admin', '/analytics/neighborhoods')).body.data as {
        riskScore: number;
      }[];
      const scores = list.map((n) => n.riskScore);
      expect(scores).toEqual([...scores].sort((x, y) => y - x));
    });

    it('limits a department manager to the department', async () => {
      const n1 = await pulseOf('manager', ids.n1);
      expect(n1?.total).toBe(12); // without the garbage report (cleaning)
      const n2 = await pulseOf('manager', ids.n2);
      expect(n2?.total).toBe(0);
    });

    it('isolates tenants and keeps citizens and field staff out', async () => {
      const other = (await get('bAdmin', '/analytics/neighborhoods').expect(200)).body.data;
      expect(other.map((n: { id: string }) => n.id)).not.toContain(ids.n1);
      await get('bAdmin', `/analytics/neighborhoods/${ids.n1}`).expect(404);
      await get('citizen', '/analytics/neighborhoods').expect(403);
      await get('field', '/analytics/neighborhoods').expect(403);
      await get('citizen', '/analytics/anomalies').expect(403);
    });

    it('detects the pothole spike, but not 2 garbage reports (minimum sample)', async () => {
      const anomalies = (await get('admin', '/analytics/anomalies').expect(200)).body.data as {
        neighborhoodId: string;
        categoryName: string;
        last7: number;
        message: string;
      }[];
      const spike = anomalies.find(
        (x) => x.neighborhoodId === ids.n1 && x.categoryName === 'Yol Çukuru',
      );
      expect(spike).toBeDefined();
      expect(spike?.message).toMatch(/^Karataş Mahallesi'nde yol çukuru bildirimleri son 7 günde/);
      expect(anomalies.some((x) => x.neighborhoodId === ids.n2)).toBe(false);
    });

    it('returns the neighbourhood detail', async () => {
      const detail = (await get('admin', `/analytics/neighborhoods/${ids.n1}`).expect(200)).body
        .data;
      expect(detail.trend).toHaveLength(90);
      expect(detail.categories[0]).toMatchObject({ name: 'Yol Çukuru' });
      expect(detail.center.latitude).toBeCloseTo(36.005, 2);
      expect(detail.openRequests.length).toBeGreaterThan(0);
      expect(detail.anomalies.length).toBeGreaterThan(0);
      await get('admin', `/analytics/neighborhoods/${randomUUID()}`).expect(404);
    });
  });

  // ─── AI analysis & duplicates ────────────────────────────────────────

  describe('AI analysis', () => {
    const analyze = (who: string, body: object) =>
      post(who, '/requests/analyze', body)
        .expect(200)
        .then((r) => r.body.data);

    it('suggests category, department and priority without storing anything', async () => {
      const before = await t.prisma.aIAnalysis.count();
      const result = await analyze('citizen', {
        description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
      });
      expect(result).toMatchObject({
        provider: 'mock',
        fallback: false,
        suggestion: {
          category: { id: ids.pothole, name: 'Yol Çukuru', parent: { name: 'Yol ve Kaldırım' } },
          department: { id: ids.works, name: 'Fen İşleri' },
          priority: 'HIGH', // category default + "okul"
        },
        possibleDuplicates: [],
      });
      expect(result.suggestion.confidence).toBeGreaterThan(0);
      expect(result.suggestion.confidence).toBeLessThanOrEqual(1);
      expect(result.suggestion.reasoning).toContain('çukur');
      expect(await t.prisma.aIAnalysis.count()).toBe(before);
    });

    it('finds near, same-category duplicates and explains the score', async () => {
      const result = await analyze('citizen', {
        description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
        ...SPOT,
      });
      const found = result.possibleDuplicates.map((d: { requestId: string }) => d.requestId);
      expect(found[0]).toBe(ids.dupNear);
      const near = result.possibleDuplicates[0];
      expect(near).toMatchObject({
        publicNumber: numbers.dupNear,
        categoryName: 'Yol Çukuru',
        possibleDuplicate: true,
        canView: true, // the citizen's own request
      });
      expect(near.distanceMeters).toBeGreaterThan(30);
      expect(near.distanceMeters).toBeLessThan(50);
      expect(near.score).toBeGreaterThanOrEqual(0.6);
      expect(near.explanation).toMatch(
        /^\d+ m uzakta · aynı kategori · 3 saat önce · metin %\d+ benzer$/,
      );
      // Citizens never get descriptions or reporters of other people's requests.
      expect(Object.keys(near)).not.toContain('description');
    });

    it('ranks similar text higher (pg_trgm) and excludes far, old, closed and foreign requests', async () => {
      const result = await analyze('admin', {
        description: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
        ...SPOT,
        categoryId: ids.pothole,
      });
      const byId = new Map(
        result.possibleDuplicates.map((d: { requestId: string; score: number }) => [
          d.requestId,
          d,
        ]),
      );
      const similar = byId.get(ids.dupNear) as { score: number; components: { text: number } };
      const other = byId.get(ids.dupOtherText) as { score: number; components: { text: number } };
      expect(similar.components.text).toBeGreaterThan(other.components.text);
      expect(similar.score).toBeGreaterThan(other.score);
      for (const excluded of ['dupFar', 'dupOld', 'dupClosed', 'dupOtherTenant']) {
        expect(byId.has(ids[excluded])).toBe(false);
      }
    });

    it('requires request-create permission', async () => {
      await post('field', '/requests/analyze', {
        description: 'Yolda çukur var lütfen bakın',
      }).expect(403);
      await post('citizen', '/requests/analyze', { description: 'kısa' }).expect(400);
    });

    it('stores the analysis on creation – sanitised, and visible to staff only', async () => {
      const description =
        'Evimin önündeki yolda büyük bir çukur oluştu, bana zeynep.test@example.com adresinden ulaşabilirsiniz.';
      const created = await post('citizen', '/requests', {
        categoryId: ids.pothole,
        description,
        ...SPOT,
      }).expect(201);
      const id = created.body.data.id as string;
      expect(created.body.data.ai).toBeNull(); // citizen view

      const stored = await t.prisma.aIAnalysis.findFirstOrThrow({ where: { requestId: id } });
      expect(stored).toMatchObject({
        provider: 'mock',
        model: 'keyword-rules-v1',
        suggestedCategoryId: ids.pothole,
        suggestedDepartmentId: ids.works,
        prioritySuggestion: 'HIGH',
        accepted: true,
      });
      expect(stored.latencyMs).toEqual(expect.any(Number));
      const persisted = JSON.stringify([stored.classification, stored.rawResponse, stored.summary]);
      expect(persisted).not.toContain('zeynep.test@example.com');
      // Only a masked one-sentence summary and the reasoning are kept – no contact data.
      expect(stored.summary).toContain('[e-posta]');
      const matches = await t.prisma.duplicateMatch.findMany({ where: { requestId: id } });
      expect(matches.map((m) => m.matchedRequestId)).toContain(ids.dupNear);

      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: AuditAction.REQUEST_AI_ANALYZED, entityId: id },
      });
      expect(JSON.stringify(audit)).not.toContain('example.com');

      const staffView = (await get('admin', `/requests/${id}`).expect(200)).body.data;
      expect(staffView.ai).toMatchObject({
        provider: 'mock',
        category: { id: ids.pothole },
        department: { id: ids.works },
        priority: 'HIGH',
        accepted: true,
      });
      expect(staffView.ai.duplicates[0]).toMatchObject({ requestId: ids.dupNear });
      expect(staffView.ai.summary).toContain('[e-posta]');
    });
  });

  // ─── Join ────────────────────────────────────────────────────────────

  describe('join an existing request', () => {
    it('lets a citizen join once, and then follow the request', async () => {
      await get('citizen2', `/requests/${ids.dupNear}`).expect(404);
      const joined = await post('citizen2', `/requests/${ids.dupNear}/join`).expect(200);
      expect(joined.body.data).toMatchObject({
        id: ids.dupNear,
        supporterCount: 1,
        joined: true,
        reporter: null,
        ai: null,
      });
      expect(joined.body.data.timeline.at(-1)).toMatchObject({
        type: 'CITIZEN_JOINED',
        performedBy: null,
      });
      await get('citizen2', `/requests/${ids.dupNear}`).expect(200);
      const again = await post('citizen2', `/requests/${ids.dupNear}/join`).expect(409);
      expect(again.body.code).toBe('ALREADY_JOINED');
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.REQUEST_JOINED, entityId: ids.dupNear },
        }),
      ).toBe(1);
    });

    it('refuses own, closed and foreign requests', async () => {
      const own = await post('citizen', `/requests/${ids.dupNear}/join`).expect(409);
      expect(own.body.code).toBe('CANNOT_JOIN_OWN_REQUEST');
      const closed = await post('citizen2', `/requests/${ids.dupClosed}/join`).expect(409);
      expect(closed.body.code).toBe('REQUEST_CLOSED');
      await post('citizen2', `/requests/${ids.dupOtherTenant}/join`).expect(404);
      await post('field', `/requests/${ids.dupNear}/join`).expect(403);
    });
  });
});
