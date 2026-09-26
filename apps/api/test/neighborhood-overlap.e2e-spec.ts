import {
  bearer,
  createTenant,
  createTestApp,
  login,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

/** Axis-aligned rectangle as a GeoJSON Polygon, [lng, lat]. */
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
const feature = (code: string, geometry: unknown) => ({
  type: 'Feature',
  properties: { name: `Mahalle ${code}`, code },
  geometry,
});
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('Neighbourhood boundary overlap (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let adminA: ReturnType<typeof bearer>;
  let adminB: ReturnType<typeof bearer>;
  let baseId: string;

  const create = (auth: ReturnType<typeof bearer>, code: string, geometry: unknown) =>
    t
      .http()
      .post('/api/v1/neighborhoods')
      .set(auth)
      .send({ name: `Mahalle ${code}`, code, geometry });
  const count = (municipalityId: string) =>
    t.prisma.neighborhood.count({ where: { municipalityId } });

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Alfa');
    b = await createTenant(t.prisma, 'Beta');
    adminA = bearer((await login(t, a.users.admin.email)).accessToken);
    adminB = bearer((await login(t, b.users.admin.email)).accessToken);
    baseId = (await create(adminA, 'BASE', box(35.0, 35.0, 35.02, 35.02)).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await t.close();
  });

  it('accepts neighbours that only share a border line or a corner', async () => {
    await create(adminA, 'EAST', box(35.02, 35.0, 35.04, 35.02)).expect(201);
    await create(adminA, 'CORNER', box(35.02, 35.02, 35.04, 35.04)).expect(201);
  });

  it('ignores sub-tolerance slivers (floating-point artefacts)', async () => {
    // Overlaps EAST by 1e-9° (≈ 0.1 mm) along 2.2 km – about 0.2 m², below the 1 m² tolerance.
    await create(adminA, 'SLIVER', box(35.04 - 1e-9, 35.0, 35.06, 35.02)).expect(201);
  });

  it('rejects a real area overlap and names the neighbourhoods it collides with', async () => {
    const res = await create(adminA, 'OVERLAP', box(35.01, 35.01, 35.03, 35.03)).expect(409);
    expect(res.body.code).toBe('NEIGHBORHOOD_BOUNDARY_OVERLAP');
    expect(res.body.message).toMatch(
      /Mahalle (BASE|EAST|CORNER) \((BASE|EAST|CORNER)\).*çakışıyor/,
    );
    const conflicts = res.body.details.conflicts as {
      code: string;
      name: string;
      overlapM2: number;
    }[];
    expect(conflicts.map((c) => c.code).sort()).toEqual(['BASE', 'CORNER', 'EAST']);
    expect(conflicts[0]).toEqual({
      code: expect.any(String),
      name: expect.any(String),
      overlapM2: expect.any(Number),
    });
    expect(conflicts.every((c) => c.overlapM2 > 1_000_000)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/coordinates/);
    expect(
      await t.prisma.neighborhood.count({
        where: { municipalityId: a.municipalityId, code: 'OVERLAP' },
      }),
    ).toBe(0);
  });

  it('allows the same area in another municipality', async () => {
    await create(adminB, 'OVERLAP', box(35.01, 35.01, 35.03, 35.03)).expect(201);
  });

  it('checks boundary updates and re-activations, ignoring the neighbourhood itself', async () => {
    // Growing BASE over EAST is an overlap…
    const grown = await t
      .http()
      .patch(`/api/v1/neighborhoods/${baseId}`)
      .set(adminA)
      .send({ geometry: box(35.0, 35.0, 35.03, 35.02) })
      .expect(409);
    expect(grown.body.details.conflicts.map((c: { code: string }) => c.code)).toEqual(['EAST']);
    // …shrinking it is fine (it overlaps its own old shape, which is excluded).
    await t
      .http()
      .patch(`/api/v1/neighborhoods/${baseId}`)
      .set(adminA)
      .send({ geometry: box(35.0, 35.0, 35.015, 35.02) })
      .expect(200);

    // Inactive neighbourhoods do not block; re-activating into an occupied area does.
    await t
      .http()
      .patch(`/api/v1/neighborhoods/${baseId}`)
      .set(adminA)
      .send({ status: 'INACTIVE' })
      .expect(200);
    await create(adminA, 'SUCCESSOR', box(35.0, 35.0, 35.015, 35.02)).expect(201);
    const reactivate = await t
      .http()
      .patch(`/api/v1/neighborhoods/${baseId}`)
      .set(adminA)
      .send({ status: 'ACTIVE' })
      .expect(409);
    expect(reactivate.body.details.conflicts[0]).toMatchObject({
      code: 'SUCCESSOR',
      name: 'Mahalle SUCCESSOR',
    });
    const base = await t.prisma.neighborhood.findUniqueOrThrow({ where: { id: baseId } });
    expect(base.status).toBe('INACTIVE');
  });

  it('rolls back the whole import when two features of the file overlap', async () => {
    const before = await count(a.municipalityId);
    const res = await t
      .http()
      .post('/api/v1/neighborhoods/import')
      .set(adminA)
      .send(
        collection(
          feature('FILE_OK', box(34.0, 34.0, 34.01, 34.01)),
          feature('FILE_A', box(34.1, 34.1, 34.12, 34.12)),
          feature('FILE_B', box(34.11, 34.11, 34.13, 34.13)),
        ),
      )
      .expect(409);
    expect(res.body.code).toBe('NEIGHBORHOOD_BOUNDARY_OVERLAP');
    expect(res.body.details.errors).toEqual([
      expect.objectContaining({
        index: 2,
        code: 'FILE_B',
        reason: 'NEIGHBORHOOD_BOUNDARY_OVERLAP',
        conflict: expect.objectContaining({
          code: 'FILE_A',
          name: 'Mahalle FILE_A',
          source: 'file',
        }),
      }),
    ]);
    expect(await count(a.municipalityId)).toBe(before);
  });

  it('rolls back the whole import when a feature overlaps a stored neighbourhood', async () => {
    const before = await count(a.municipalityId);
    const res = await t
      .http()
      .post('/api/v1/neighborhoods/import')
      .set(adminA)
      .send(
        collection(
          feature('DB_OK', box(33.0, 33.0, 33.01, 33.01)),
          feature('DB_HIT', box(35.025, 35.005, 35.035, 35.015)),
        ),
      )
      .expect(409);
    expect(res.body.details.errors).toEqual([
      expect.objectContaining({
        index: 1,
        code: 'DB_HIT',
        conflict: expect.objectContaining({ code: 'EAST', source: 'database' }),
      }),
    ]);
    expect(await count(a.municipalityId)).toBe(before);
    expect(
      await t.prisma.neighborhood.count({
        where: { municipalityId: a.municipalityId, code: 'DB_OK' },
      }),
    ).toBe(0);
  });

  it('reports overlaps alongside other problems under NEIGHBORHOOD_IMPORT_FAILED', async () => {
    const res = await t
      .http()
      .post('/api/v1/neighborhoods/import')
      .set(adminA)
      .send(collection(feature('MIX_HIT', box(35.025, 35.005, 35.035, 35.015)), { type: 'Point' }))
      .expect(400);
    expect(res.body.code).toBe('NEIGHBORHOOD_IMPORT_FAILED');
    expect(res.body.details.errors.map((e: { reason?: string }) => e.reason ?? null)).toEqual([
      'NEIGHBORHOOD_BOUNDARY_OVERLAP',
      null,
    ]);
  });

  it('lets only one of two concurrent, mutually overlapping imports through', async () => {
    const results = await Promise.all([
      t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(adminA)
        .send(collection(feature('RACE_1', box(32.0, 32.0, 32.02, 32.02)))),
      t
        .http()
        .post('/api/v1/neighborhoods/import')
        .set(adminA)
        .send(collection(feature('RACE_2', box(32.01, 32.01, 32.03, 32.03)))),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await t.prisma.neighborhood.count({
        where: { municipalityId: a.municipalityId, code: { in: ['RACE_1', 'RACE_2'] } },
      }),
    ).toBe(1);
  });

  it('keeps the resolver deterministic on shared borders (safety net)', async () => {
    const res = await t
      .http()
      .get('/api/v1/neighborhoods/resolve?lat=35.01&lng=35.02')
      .set(adminA)
      .expect(200);
    expect(['EAST', 'SUCCESSOR']).toContain(res.body.data.code);
  });
});
