import { AuditAction } from '@kent360/shared-types';
import {
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

/** Closed rectangle ring, [lng, lat]. */
const rect = (w: number, s: number, e: number, n: number) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];
const polygon = (w: number, s: number, e: number, n: number) => ({
  type: 'Polygon',
  coordinates: [rect(w, s, e, n)],
});
/** Self-intersecting "bow tie": structurally fine GeoJSON, invalid for PostGIS. */
const bowTie = {
  type: 'Polygon',
  coordinates: [
    [
      [37.0, 37.0],
      [37.01, 37.01],
      [37.01, 37.0],
      [37.0, 37.01],
      [37.0, 37.0],
    ],
  ],
};
const feature = (code: string, geometry: unknown, name = `Mahalle ${code}`) => ({
  type: 'Feature',
  properties: { name, code },
  geometry,
});

describe('Municipality domain (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const tokens: Record<string, string> = {};
  const as = (who: string) => bearer(tokens[who]);

  const audits = (municipalityId: string, action: string) =>
    t.prisma.auditLog.findMany({
      where: { municipalityId, action },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Alfa');
    b = await createTenant(t.prisma, 'Beta');
    for (const [key, tenant] of [
      ['a', a],
      ['b', b],
    ] as const) {
      for (const role of ['admin', 'manager', 'field', 'citizen'] as const) {
        tokens[`${key}.${role}`] = (await login(t, tenant.users[role].email)).accessToken;
      }
    }
  });

  afterAll(async () => {
    await t.close();
  });

  // ─── Municipality ────────────────────────────────────────────────────────

  describe('municipality', () => {
    it('returns only the caller’s own municipality', async () => {
      const res = await t.http().get('/api/v1/municipality').set(as('a.admin')).expect(200);
      expect(res.body.data).toMatchObject({ id: a.municipalityId, name: 'Alfa Belediyesi' });
      await t.http().get('/api/v1/municipality').set(as('a.manager')).expect(200);
      await t.http().get('/api/v1/municipality').set(as('a.field')).expect(403);
    });

    it('updates branding (audited with only the changed fields) and exposes it on /auth/me', async () => {
      const res = await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.admin'))
        .send({ primaryColor: '#0F766E', contactPhone: '+90 342 000 00 00', website: '' })
        .expect(200);
      expect(res.body.data).toMatchObject({ primaryColor: '#0F766E', website: null });

      const [audit] = await audits(a.municipalityId, AuditAction.MUNICIPALITY_UPDATED);
      expect(audit.beforeData).toEqual({ primaryColor: '#2563EB', contactPhone: null });
      expect(audit.afterData).toEqual({
        primaryColor: '#0F766E',
        contactPhone: '+90 342 000 00 00',
      });

      const me = await t.http().get('/api/v1/auth/me').set(as('a.field')).expect(200);
      expect(me.body.data.municipality.primaryColor).toBe('#0F766E');
    });

    it('validates input and requires municipality.update', async () => {
      await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.admin'))
        .send({ primaryColor: 'red' })
        .expect(400);
      await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.admin'))
        .send({ logoUrl: 'javascript:alert(1)' })
        .expect(400);
      await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.admin'))
        .send({ timezone: 'Mars/Base' })
        .expect(400);
      await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.admin'))
        .send({ slug: 'x' })
        .expect(400);
      await t
        .http()
        .patch('/api/v1/municipality')
        .set(as('a.manager'))
        .send({ name: 'X' })
        .expect(403);
    });
  });

  // ─── Departments ─────────────────────────────────────────────────────────

  describe('departments', () => {
    let aWorks: string;
    let aParks: string;

    beforeAll(async () => {
      const works = await t
        .http()
        .post('/api/v1/departments')
        .set(as('a.admin'))
        .send({ name: 'Fen İşleri Müdürlüğü', code: 'PUBLIC_WORKS' })
        .expect(201);
      aWorks = works.body.data.id;
      aParks = (
        await t
          .http()
          .post('/api/v1/departments')
          .set(as('a.admin'))
          .send({ name: 'Park ve Bahçeler Müdürlüğü', code: 'PARKS_AND_GARDENS' })
          .expect(201)
      ).body.data.id;
    });

    it('allows the same code in another municipality but not twice in one', async () => {
      await t
        .http()
        .post('/api/v1/departments')
        .set(as('b.admin'))
        .send({ name: 'Fen İşleri', code: 'PUBLIC_WORKS' })
        .expect(201);
      const dup = await t
        .http()
        .post('/api/v1/departments')
        .set(as('a.admin'))
        .send({ name: 'Başka', code: 'PUBLIC_WORKS' })
        .expect(409);
      expect(dup.body.code).toBe('DEPARTMENT_CODE_TAKEN');
      await t
        .http()
        .post('/api/v1/departments')
        .set(as('a.admin'))
        .send({ name: 'Bozuk', code: 'public works' })
        .expect(400);
    });

    it('hides another municipality’s department on read and write (404)', async () => {
      const read = await t
        .http()
        .get(`/api/v1/departments/${aWorks}`)
        .set(as('b.admin'))
        .expect(404);
      expect(read.body.code).toBe('DEPARTMENT_NOT_FOUND');
      await t
        .http()
        .patch(`/api/v1/departments/${aWorks}`)
        .set(as('b.admin'))
        .send({ name: 'Ele geçirildi' })
        .expect(404);
      const row = await t.prisma.department.findUniqueOrThrow({ where: { id: aWorks } });
      expect(row.name).toBe('Fen İşleri Müdürlüğü');
    });

    it('lists with search, status filter and pagination', async () => {
      const res = await t
        .http()
        .get('/api/v1/departments?search=park&pageSize=1')
        .set(as('a.manager'))
        .expect(200);
      expect(res.body.data.map((d: { code: string }) => d.code)).toEqual(['PARKS_AND_GARDENS']);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 1 });
      const inactive = await t
        .http()
        .get('/api/v1/departments?status=INACTIVE')
        .set(as('a.admin'))
        .expect(200);
      expect(inactive.body.data).toEqual([]);
    });

    it('deactivates instead of deleting, but not while categories route to it', async () => {
      // A category routed to PUBLIC_WORKS makes it "in use".
      const root = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Yol', code: 'DEPT_TEST_ROOT', departmentId: aWorks })
        .expect(201);
      const blocked = await t
        .http()
        .patch(`/api/v1/departments/${aWorks}`)
        .set(as('a.admin'))
        .send({ status: 'INACTIVE' })
        .expect(409);
      expect(blocked.body.code).toBe('DEPARTMENT_IN_USE');

      const res = await t
        .http()
        .patch(`/api/v1/departments/${aParks}`)
        .set(as('a.admin'))
        .send({ status: 'INACTIVE', description: 'Birleştirildi' })
        .expect(200);
      expect(res.body.data.status).toBe('INACTIVE');
      const [statusAudit] = await audits(a.municipalityId, AuditAction.DEPARTMENT_STATUS_CHANGED);
      expect(statusAudit.afterData).toEqual({ status: 'INACTIVE' });
      expect(await audits(a.municipalityId, AuditAction.DEPARTMENT_UPDATED)).toHaveLength(1);

      // An inactive department cannot receive new routing.
      const routed = await t
        .http()
        .patch(`/api/v1/request-categories/${root.body.data.id}`)
        .set(as('a.admin'))
        .send({ departmentId: aParks })
        .expect(409);
      expect(routed.body.code).toBe('DEPARTMENT_INACTIVE');
      expect(
        await t.http().delete(`/api/v1/departments/${aParks}`).set(as('a.admin')),
      ).toHaveProperty('status', 404);
    });

    it('enforces departments.read / departments.manage', async () => {
      await t.http().get('/api/v1/departments').set(as('a.field')).expect(200);
      await t
        .http()
        .post('/api/v1/departments')
        .set(as('a.field'))
        .send({ name: 'X', code: 'XX' })
        .expect(403);
      await t.http().get('/api/v1/departments').set(as('a.citizen')).expect(403);
    });
  });

  // ─── Neighbourhoods ──────────────────────────────────────────────────────

  describe('neighbourhoods', () => {
    let karatas: string;

    it('creates a Polygon neighbourhood with centre and area computed by PostGIS', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({
          name: 'Karataş',
          code: 'KARATAS',
          district: 'Şahinbey',
          geometry: polygon(37.36, 37.05, 37.372, 37.062),
        })
        .expect(201);
      karatas = res.body.data.id;
      expect(res.body.data).toMatchObject({
        geometryType: 'Polygon',
        partCount: 1,
        status: 'ACTIVE',
      });
      expect(res.body.data.areaKm2).toBeGreaterThan(1);
      expect(res.body.data.center.latitude).toBeCloseTo(37.056, 2);
      expect(res.body.data.boundary.type).toBe('MultiPolygon');
      expect(await audits(a.municipalityId, AuditAction.NEIGHBORHOOD_CREATED)).toHaveLength(1);
    });

    it('creates a MultiPolygon neighbourhood', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({
          name: 'Binevler',
          code: 'BINEVLER',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [rect(37.374, 37.064, 37.386, 37.076)],
              [rect(37.388, 37.064, 37.394, 37.07)],
            ],
          },
        })
        .expect(201);
      expect(res.body.data).toMatchObject({ geometryType: 'MultiPolygon', partCount: 2 });
      expect(res.body.data.boundary.coordinates).toHaveLength(2);
    });

    it.each([
      ['a Point', { type: 'Point', coordinates: [37, 37] }, /Polygon veya MultiPolygon/],
      [
        'an unclosed ring',
        { type: 'Polygon', coordinates: [rect(37, 37, 37.1, 37.1).slice(0, 4)] },
        /kapalı değil/,
      ],
      ['projected coordinates', polygon(500000, 4100000, 500100, 4100100), /aralık dışında/],
      ['an empty geometry', { type: 'Polygon', coordinates: [] }, /boş/],
    ])('rejects %s as invalid GeoJSON', async (_label, geometry, message) => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({ name: 'Bozuk', code: 'BROKEN', geometry })
        .expect(400);
      expect(res.body.code).toBe('INVALID_GEOMETRY');
      expect(res.body.message).toMatch(message);
    });

    it('rejects a geometry PostGIS considers invalid (self-intersection)', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({ name: 'Papyon', code: 'BOWTIE', geometry: bowTie })
        .expect(400);
      expect(res.body.code).toBe('INVALID_GEOMETRY');
      expect(res.body.details.reason).toMatch(/Self-intersection/i);
      expect(await t.prisma.neighborhood.count({ where: { code: 'BOWTIE' } })).toBe(0);
    });

    it('rejects a duplicate code in the same municipality', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({
          name: 'İkinci Karataş',
          code: 'KARATAS',
          geometry: polygon(37.5, 37.5, 37.51, 37.51),
        })
        .expect(409);
      expect(res.body.code).toBe('NEIGHBORHOOD_CODE_TAKEN');
      // …while another municipality may use it.
      await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('b.admin'))
        .send({ name: 'Karataş', code: 'KARATAS', geometry: polygon(37.6, 37.6, 37.61, 37.61) })
        .expect(201);
    });

    it('resolves a coordinate to its neighbourhood – within the tenant only', async () => {
      const inside = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37.0585&lng=37.371')
        .set(as('a.citizen'))
        .expect(200);
      expect(inside.body.data).toMatchObject({ id: karatas, code: 'KARATAS', name: 'Karataş' });

      const outside = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=39.9&lng=32.8')
        .set(as('a.citizen'))
        .expect(200);
      expect(outside.body.data).toBeNull();

      // Beta's Karataş is elsewhere; Alfa's polygon is invisible to Beta.
      const foreign = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37.0585&lng=37.371')
        .set(as('b.admin'))
        .expect(200);
      expect(foreign.body.data).toBeNull();

      await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=91&lng=37')
        .set(as('a.admin'))
        .expect(400);
      await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37&lng=abc')
        .set(as('a.admin'))
        .expect(400);
    });

    it('resolves points on a boundary line (ST_Covers), deterministically on shared edges', async () => {
      // Two squares sharing the edge lng = 37.2; the east one is smaller.
      const west = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({ name: 'Batı', code: 'EDGE_WEST', geometry: polygon(37.18, 37.2, 37.2, 37.22) })
        .expect(201);
      const east = await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.admin'))
        .send({ name: 'Doğu', code: 'EDGE_EAST', geometry: polygon(37.2, 37.2, 37.21, 37.21) })
        .expect(201);

      const outerEdge = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37.215&lng=37.18')
        .set(as('a.admin'))
        .expect(200);
      expect(outerEdge.body.data?.id).toBe(west.body.data.id);

      const shared = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37.205&lng=37.2')
        .set(as('a.admin'))
        .expect(200);
      expect(shared.body.data?.id).toBe(east.body.data.id);
    });

    it('serves a valid GeoJSON FeatureCollection of active neighbourhoods', async () => {
      const res = await t
        .http()
        .get('/api/v1/neighborhoods/geojson')
        .set(as('a.field'))
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/geo\+json/);
      const body = JSON.parse(res.text) as {
        type: string;
        features: {
          type: string;
          id: string;
          geometry: { type: string };
          properties: Record<string, unknown>;
        }[];
      };
      expect(body.type).toBe('FeatureCollection');
      expect(body.features.length).toBeGreaterThanOrEqual(4);
      for (const f of body.features) {
        expect(f.type).toBe('Feature');
        expect(f.geometry.type).toBe('MultiPolygon');
        expect(Object.keys(f.properties).sort()).toEqual(['code', 'id', 'name']);
      }
      const codes = body.features.map((f) => f.properties.code);
      expect(codes).toContain('KARATAS');
      // Only Alfa's data (Beta also has a KARATAS – exactly one may appear).
      expect(codes.filter((c) => c === 'KARATAS')).toHaveLength(1);
    });

    it('deactivates a neighbourhood (audited): it leaves the map and the resolver', async () => {
      const res = await t
        .http()
        .patch(`/api/v1/neighborhoods/${karatas}`)
        .set(as('a.admin'))
        .send({ status: 'INACTIVE', population: 12000 })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'INACTIVE', population: 12000 });
      const resolved = await t
        .http()
        .get('/api/v1/neighborhoods/resolve?lat=37.0585&lng=37.371')
        .set(as('a.admin'))
        .expect(200);
      expect(resolved.body.data).toBeNull();
      const geo = JSON.parse(
        (await t.http().get('/api/v1/neighborhoods/geojson').set(as('a.admin'))).text,
      );
      expect(
        geo.features.map((f: { properties: { code: string } }) => f.properties.code),
      ).not.toContain('KARATAS');

      expect(await audits(a.municipalityId, AuditAction.NEIGHBORHOOD_STATUS_CHANGED)).toHaveLength(
        1,
      );
      const [updated] = await audits(a.municipalityId, AuditAction.NEIGHBORHOOD_UPDATED);
      expect(updated.afterData).toEqual({ population: 12000 });

      // Geometry replacement is validated the same way.
      await t
        .http()
        .patch(`/api/v1/neighborhoods/${karatas}`)
        .set(as('a.admin'))
        .send({ geometry: bowTie })
        .expect(400);
    });

    it('hides another municipality’s neighbourhood (404) and enforces permissions', async () => {
      await t.http().get(`/api/v1/neighborhoods/${karatas}`).set(as('b.admin')).expect(404);
      await t
        .http()
        .patch(`/api/v1/neighborhoods/${karatas}`)
        .set(as('b.admin'))
        .send({ name: 'Ele geçirildi' })
        .expect(404);
      await t.http().get('/api/v1/neighborhoods').set(as('a.citizen')).expect(200);
      await t
        .http()
        .post('/api/v1/neighborhoods')
        .set(as('a.manager'))
        .send({ name: 'X', code: 'X', geometry: polygon(37, 37, 37.01, 37.01) })
        .expect(403);
    });
  });

  // ─── GeoJSON import ──────────────────────────────────────────────────────

  describe('GeoJSON import', () => {
    const collection = (features: unknown[], extra: Record<string, unknown> = {}) => ({
      type: 'FeatureCollection',
      ...extra,
      features,
    });

    it('validates without writing in dry-run mode', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods/import?dryRun=true')
        .set(as('a.admin'))
        .send(collection([feature('DRY_1', polygon(36.9, 36.9, 36.91, 36.91))]))
        .expect(200);
      expect(res.body.data).toEqual({ imported: 0, failed: 0, dryRun: true, codes: ['DRY_1'] });
      expect(await t.prisma.neighborhood.count({ where: { code: 'DRY_1' } })).toBe(0);
    });

    it('imports a FeatureCollection (Polygon + MultiPolygon, WGS84 crs) atomically and audits it', async () => {
      const res = await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.admin'))
        .send(
          collection(
            [
              feature('IMP_1', polygon(36.8, 36.8, 36.81, 36.81), 'Yeni Mahalle 1'),
              feature('IMP_2', {
                type: 'MultiPolygon',
                coordinates: [[rect(36.82, 36.8, 36.83, 36.81)], [rect(36.84, 36.8, 36.85, 36.81)]],
              }),
            ],
            {
              name: 'mahalleler',
              crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
            },
          ),
        )
        .expect(200);
      expect(res.body.data).toEqual({
        imported: 2,
        failed: 0,
        dryRun: false,
        codes: ['IMP_1', 'IMP_2'],
      });
      const [audit] = await audits(a.municipalityId, AuditAction.NEIGHBORHOODS_IMPORTED);
      expect(audit.afterData).toEqual({ imported: 2, codes: ['IMP_1', 'IMP_2'] });
    });

    it('rolls back completely when any feature fails, reporting every problem', async () => {
      const before = await t.prisma.neighborhood.count({
        where: { municipalityId: a.municipalityId },
      });
      const res = await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.admin'))
        .send(
          collection([
            feature('OK_BUT_NOT_ALONE', polygon(36.7, 36.7, 36.71, 36.71)),
            feature('BAD_TOPOLOGY', bowTie),
            feature('IMP_1', polygon(36.72, 36.7, 36.73, 36.71)), // exists already
            feature('DUP_IN_FILE', polygon(36.74, 36.7, 36.75, 36.71)),
            feature('DUP_IN_FILE', polygon(36.76, 36.7, 36.77, 36.71)),
            {
              type: 'Feature',
              properties: { name: 'Nokta', code: 'PT' },
              geometry: { type: 'Point', coordinates: [1, 1] },
            },
          ]),
        )
        .expect(400);

      expect(res.body.code).toBe('NEIGHBORHOOD_IMPORT_FAILED');
      expect(res.body.details).toMatchObject({ imported: 0, failed: 4 });
      expect(res.body.details.errors.map((e: { index: number }) => e.index)).toEqual([1, 2, 4, 5]);
      expect(res.body.details.errors[0].message).toMatch(/Self-intersection/i);
      expect(
        await t.prisma.neighborhood.count({ where: { municipalityId: a.municipalityId } }),
      ).toBe(before);
      expect(await t.prisma.neighborhood.count({ where: { code: 'OK_BUT_NOT_ALONE' } })).toBe(0);
    });

    it('rejects non-FeatureCollection bodies, projected CRS and unauthorised callers', async () => {
      await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.admin'))
        .send({ type: 'Feature' })
        .expect(400);
      await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.admin'))
        .send(collection([]))
        .expect(400);
      const crs = await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.admin'))
        .send(
          collection([feature('CRS_1', polygon(36.6, 36.6, 36.61, 36.61))], {
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::5254' } },
          }),
        )
        .expect(400);
      expect(crs.body.details.errors[0].message).toMatch(/EPSG:4326/);
      await t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(as('a.manager'))
        .send(collection([feature('X1', polygon(36.5, 36.5, 36.51, 36.51))]))
        .expect(403);
    });
  });

  // ─── Request categories ──────────────────────────────────────────────────

  describe('request categories', () => {
    let works: string;
    let bWorks: string;
    let road: string;
    let bRoot: string;

    beforeAll(async () => {
      works = (
        await t
          .http()
          .post('/api/v1/departments')
          .set(as('a.admin'))
          .send({ name: 'Yol Bakım', code: 'ROAD_MAINTENANCE' })
          .expect(201)
      ).body.data.id;
      bWorks = (
        await t
          .http()
          .post('/api/v1/departments')
          .set(as('b.admin'))
          .send({ name: 'Yol Bakım', code: 'ROAD_MAINTENANCE' })
          .expect(201)
      ).body.data.id;
      bRoot = (
        await t
          .http()
          .post('/api/v1/request-categories')
          .set(as('b.admin'))
          .send({ name: 'Beta Yol', code: 'ROAD' })
          .expect(201)
      ).body.data.id;
    });

    it('builds a two-level hierarchy with routing and inherited SLA', async () => {
      const root = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({
          name: 'Yol ve Kaldırım',
          code: 'ROAD',
          icon: 'construction',
          defaultSlaMinutes: 4320,
        })
        .expect(201);
      road = root.body.data.id;
      expect(root.body.data).toMatchObject({
        parentId: null,
        departmentId: null,
        slaLabel: '3 gün',
      });

      const missingDept = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Yol Çukuru', code: 'ROAD_POTHOLE', parentId: road })
        .expect(400);
      expect(missingDept.body.code).toBe('CATEGORY_DEPARTMENT_REQUIRED');

      const pothole = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({
          name: 'Yol Çukuru',
          code: 'ROAD_POTHOLE',
          parentId: road,
          departmentId: works,
          defaultPriority: 'HIGH',
          defaultSlaMinutes: 240,
          keywords: ['Çukur', ' yol ', 'çukur'],
        })
        .expect(201);
      expect(pothole.body.data).toMatchObject({
        defaultPriority: 'HIGH',
        effectiveSlaMinutes: 240,
        slaLabel: '4 saat',
        keywords: ['çukur', 'yol'],
        department: { id: works, code: 'ROAD_MAINTENANCE' },
      });

      const inherited = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Asfalt', code: 'ROAD_ASPHALT', parentId: road, departmentId: works })
        .expect(201);
      expect(inherited.body.data).toMatchObject({
        defaultSlaMinutes: null,
        effectiveSlaMinutes: 4320,
        slaLabel: '3 gün',
      });

      const tree = await t
        .http()
        .get('/api/v1/request-categories/tree')
        .set(as('a.citizen'))
        .expect(200);
      const roadNode = tree.body.data.find((n: { code: string }) => n.code === 'ROAD');
      expect(roadNode.children.map((c: { code: string }) => c.code)).toEqual([
        'ROAD_ASPHALT',
        'ROAD_POTHOLE',
      ]);
      expect(roadNode.childCount).toBe(2);
      // Only Alfa's categories (Beta has a ROAD root too).
      expect(tree.body.data.filter((n: { code: string }) => n.code === 'ROAD')).toHaveLength(1);
    });

    it('keeps the tree two levels deep', async () => {
      const pothole = await t.prisma.requestCategory.findFirstOrThrow({
        where: { municipalityId: a.municipalityId, code: 'ROAD_POTHOLE' },
      });
      const third = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Derin', code: 'TOO_DEEP', parentId: pothole.id, departmentId: works })
        .expect(409);
      expect(third.body.code).toBe('CATEGORY_HIERARCHY_INVALID');

      const other = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Temizlik', code: 'CLEANING', departmentId: works })
        .expect(201);
      await t
        .http()
        .patch(`/api/v1/request-categories/${road}`)
        .set(as('a.admin'))
        .send({ parentId: other.body.data.id, departmentId: works })
        .expect(409);
    });

    it('rejects a parent from another municipality', async () => {
      const res = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Sızma', code: 'CROSS_PARENT', parentId: bRoot, departmentId: works })
        .expect(404);
      expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('rejects a department from another municipality – in the API and in the database', async () => {
      const res = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Sızma', code: 'CROSS_DEPT', parentId: road, departmentId: bWorks })
        .expect(404);
      expect(res.body.code).toBe('DEPARTMENT_NOT_FOUND');

      // Even code that bypasses the service is stopped by the trigger.
      await expect(
        t.prisma.requestCategory.create({
          data: {
            municipalityId: a.municipalityId,
            name: 'Bypass',
            code: 'BYPASS',
            departmentId: bWorks,
          },
        }),
      ).rejects.toThrow();
      await expect(
        t.prisma.requestCategory.create({
          data: {
            municipalityId: a.municipalityId,
            name: 'Bypass',
            code: 'BYPASS2',
            parentId: bRoot,
          },
        }),
      ).rejects.toThrow();
      expect(
        await t.prisma.requestCategory.count({ where: { code: { in: ['BYPASS', 'BYPASS2'] } } }),
      ).toBe(0);
    });

    it.each([
      [0, 400],
      [-5, 400],
      [1.5, 400],
      [525_601, 400],
      [1, 201],
      [525_600, 201],
    ])('validates SLA minutes = %p → %i', async (minutes, status) => {
      const code = `SLA_${String(minutes).replace(/\D/g, '')}_${status}`;
      const res = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'SLA', code, defaultSlaMinutes: minutes })
        .expect(status);
      if (status === 400) expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a duplicate code', async () => {
      const res = await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.admin'))
        .send({ name: 'Yol 2', code: 'ROAD' })
        .expect(409);
      expect(res.body.code).toBe('CATEGORY_CODE_TAKEN');
    });

    it('deactivating a root deactivates its sub-categories (audited)', async () => {
      await t
        .http()
        .patch(`/api/v1/request-categories/${road}`)
        .set(as('a.admin'))
        .send({ status: 'INACTIVE' })
        .expect(200);
      const children = await t.prisma.requestCategory.findMany({ where: { parentId: road } });
      expect(children.every((c) => c.status === 'INACTIVE')).toBe(true);

      const [audit] = await audits(a.municipalityId, AuditAction.CATEGORY_STATUS_CHANGED);
      expect(audit.afterData).toMatchObject({
        status: 'INACTIVE',
        deactivatedSubCategories: expect.arrayContaining(['ROAD_POTHOLE', 'ROAD_ASPHALT']),
      });

      const reactivate = await t
        .http()
        .patch(`/api/v1/request-categories/${children[0].id}`)
        .set(as('a.admin'))
        .send({ status: 'ACTIVE' })
        .expect(409);
      expect(reactivate.body.code).toBe('CATEGORY_PARENT_INACTIVE');

      const active = await t
        .http()
        .get('/api/v1/request-categories/tree?status=ACTIVE')
        .set(as('a.admin'))
        .expect(200);
      expect(active.body.data.map((n: { code: string }) => n.code)).not.toContain('ROAD');
    });

    it('filters the flat list and records updates', async () => {
      const res = await t
        .http()
        .get(
          `/api/v1/request-categories?parentId=${road}&departmentId=${works}&search=${encodeURIComponent('çukur')}`,
        )
        .set(as('a.admin'))
        .expect(200);
      expect(res.body.data.map((c: { code: string }) => c.code)).toEqual(['ROAD_POTHOLE']);

      await t
        .http()
        .patch(`/api/v1/request-categories/${road}`)
        .set(as('a.admin'))
        .send({ name: 'Yol, Kaldırım ve Köprü', defaultPriority: 'HIGH' })
        .expect(200);
      const updates = await audits(a.municipalityId, AuditAction.CATEGORY_UPDATED);
      expect(updates.at(-1)!.afterData).toEqual({
        name: 'Yol, Kaldırım ve Köprü',
        defaultPriority: 'HIGH',
      });
    });

    it('enforces categories.read / categories.manage', async () => {
      await t.http().get('/api/v1/request-categories').set(as('a.citizen')).expect(200);
      await t
        .http()
        .post('/api/v1/request-categories')
        .set(as('a.manager'))
        .send({ name: 'X', code: 'XX' })
        .expect(403);
      await t.http().get(`/api/v1/request-categories/${road}`).set(as('b.admin')).expect(404);
    });
  });

  describe('audit trail', () => {
    it('recorded every Phase 4 event for the tenant, in its own municipality only', async () => {
      const actions = new Set(
        (await t.prisma.auditLog.findMany({ where: { municipalityId: a.municipalityId } })).map(
          (row) => row.action,
        ),
      );
      for (const action of [
        AuditAction.MUNICIPALITY_UPDATED,
        AuditAction.DEPARTMENT_CREATED,
        AuditAction.DEPARTMENT_UPDATED,
        AuditAction.DEPARTMENT_STATUS_CHANGED,
        AuditAction.NEIGHBORHOOD_CREATED,
        AuditAction.NEIGHBORHOOD_UPDATED,
        AuditAction.NEIGHBORHOOD_STATUS_CHANGED,
        AuditAction.NEIGHBORHOODS_IMPORTED,
        AuditAction.CATEGORY_CREATED,
        AuditAction.CATEGORY_UPDATED,
        AuditAction.CATEGORY_STATUS_CHANGED,
      ]) {
        expect(actions).toContain(action);
      }
      const betaDepartments = await audits(b.municipalityId, AuditAction.DEPARTMENT_CREATED);
      expect(betaDepartments.every((row) => row.userId === b.users.admin.id)).toBe(true);
    });
  });
});
