import { randomUUID } from 'node:crypto';
import { AuditAction, RoleCode } from '@kent360/shared-types';
import sharp from 'sharp';
import {
  animatedWebp,
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
type Who = string;

/** The work order point (request location) and positions near / far from it. */
const SITE = { latitude: 36.01, longitude: 36.01 };
const NEAR = { latitude: 36.0104, longitude: 36.0102 }; // ≈ 48 m
const FAR = { latitude: 36.03, longitude: 36.01 }; // ≈ 2.2 km

describe('Work orders & field operations (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const auth: Record<Who, Auth> = {};
  const users: Record<Who, { id: string; email: string }> = {};
  const ids: Record<string, string> = {};
  const run = randomUUID().slice(0, 6).toUpperCase();

  const http = () => t.http();
  const createRequest = (who: Who, categoryId = ids.pothole) =>
    http()
      .post('/api/v1/requests')
      .set(auth[who])
      .send({
        categoryId,
        description: `Saha testi için bildirim (${run}) – yolda çukur var.`,
        ...SITE,
        address: 'Saha Sk. No: 1',
      })
      .expect(201);
  /** A request routed to its department (ASSIGNED_TO_DEPARTMENT), ready for a work order. */
  const readyRequest = async (reporter: Who = 'manager', categoryId = ids.pothole) => {
    const id = (await createRequest(reporter, categoryId)).body.data.id as string;
    const reviewer = categoryId === ids.play ? 'parksManager' : 'manager';
    for (const to of ['UNDER_REVIEW', 'ASSIGNED_TO_DEPARTMENT']) {
      await http()
        .post(`/api/v1/requests/${id}/transitions`)
        .set(auth[reviewer])
        .send({ to })
        .expect(200);
    }
    return id;
  };
  const createWo = (who: Who, requestId: string, extra: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/work-orders')
      .set(auth[who])
      .send({ requestId, ...extra });
  const assign = (who: Who, id: string, body: Record<string, unknown>) =>
    http().post(`/api/v1/work-orders/${id}/assignment`).set(auth[who]).send(body);
  const move = (who: Who, id: string, body: Record<string, unknown>) =>
    http().post(`/api/v1/work-orders/${id}/transitions`).set(auth[who]).send(body);
  const getWo = (who: Who, id: string) => http().get(`/api/v1/work-orders/${id}`).set(auth[who]);
  const upload = (
    who: Who,
    id: string,
    type: string,
    files: { buffer: Buffer; name: string }[],
  ) => {
    let req = http().post(`/api/v1/work-orders/${id}/media`).set(auth[who]).field('type', type);
    for (const f of files) req = req.attach('files', f.buffer, { filename: f.name });
    return req;
  };
  const requestStatus = async (id: string) =>
    (await t.prisma.request.findUniqueOrThrow({ where: { id } })).status;
  /** A work order assigned to `field` (team 1), walked up to `until`. */
  const workOrderAt = async (until: 'ASSIGNED' | 'ACCEPTED' | 'ON_SITE' | 'IN_PROGRESS') => {
    const requestId = await readyRequest();
    const id = (await createWo('manager', requestId).expect(201)).body.data.id as string;
    await assign('manager', id, { fieldTeamId: ids.team1, assignedUserId: users.field.id }).expect(
      200,
    );
    const steps: [string, Record<string, unknown>][] = [
      ['ACCEPTED', {}],
      ['EN_ROUTE', {}],
      ['ON_SITE', NEAR],
      ['IN_PROGRESS', NEAR],
    ];
    for (const [to, extra] of steps) {
      if (until === 'ASSIGNED') break;
      await move('field', id, { to, ...extra }).expect(200);
      if (to === until) break;
    }
    return { id, requestId };
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Saha');
    b = await createTenant(t.prisma, 'Ote');
    const p = t.prisma;
    const works = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'WORKS', name: 'Fen İşleri' },
    });
    const parks = await p.department.create({
      data: { municipalityId: a.municipalityId, code: 'PARKS', name: 'Park ve Bahçeler' },
    });
    const bWorks = await p.department.create({
      data: { municipalityId: b.municipalityId, code: 'WORKS', name: 'Öte Fen' },
    });
    Object.assign(ids, { works: works.id, parks: parks.id, bWorks: bWorks.id });

    const road = await p.requestCategory.create({
      data: { municipalityId: a.municipalityId, code: 'ROAD', name: 'Yol', departmentId: works.id },
    });
    ids.pothole = (
      await p.requestCategory.create({
        data: {
          municipalityId: a.municipalityId,
          code: 'POTHOLE',
          name: 'Yol Çukuru',
          parentId: road.id,
          departmentId: works.id,
          defaultPriority: 'HIGH',
          defaultSlaMinutes: 240,
        },
      })
    ).id;
    const park = await p.requestCategory.create({
      data: {
        municipalityId: a.municipalityId,
        code: 'PARK',
        name: 'Park',
        departmentId: parks.id,
      },
    });
    ids.play = (
      await p.requestCategory.create({
        data: {
          municipalityId: a.municipalityId,
          code: 'PLAY',
          name: 'Oyun Grubu',
          parentId: park.id,
          departmentId: parks.id,
        },
      })
    ).id;

    await p.user.updateMany({
      where: { id: { in: [a.users.manager.id, a.users.field.id] } },
      data: { departmentId: works.id },
    });
    Object.assign(users, {
      admin: a.users.admin,
      manager: a.users.manager,
      field: a.users.field,
      citizen: a.users.citizen,
      leader: await addUser(p, a.municipalityId, 'leader', RoleCode.TEAM_LEADER, works.id),
      field2: await addUser(p, a.municipalityId, 'field2', RoleCode.FIELD_STAFF, works.id),
      outsider: await addUser(p, a.municipalityId, 'outsider', RoleCode.FIELD_STAFF, works.id),
      parksField: await addUser(p, a.municipalityId, 'parksfield', RoleCode.FIELD_STAFF, parks.id),
      parksManager: await addUser(
        p,
        a.municipalityId,
        'parksmanager',
        RoleCode.DEPARTMENT_MANAGER,
        parks.id,
      ),
      bAdmin: b.users.admin,
      bField: await addUser(p, b.municipalityId, 'bfield', RoleCode.FIELD_STAFF, bWorks.id),
    });
    for (const [who, user] of Object.entries(users)) {
      auth[who] = bearer((await login(t, user.email)).accessToken);
    }
  });

  afterAll(async () => {
    await t.close();
  });

  // ─── Field teams ─────────────────────────────────────────────────────

  describe('field teams', () => {
    it('creates teams in the manager’s own department only', async () => {
      const team1 = await http()
        .post('/api/v1/field-teams')
        .set(auth.manager)
        .send({ departmentId: ids.works, name: 'Fen İşleri – Ekip 1', code: `T1_${run}` })
        .expect(201);
      expect(team1.body.data).toMatchObject({
        name: 'Fen İşleri – Ekip 1',
        status: 'ACTIVE',
        department: { id: ids.works },
        memberCount: 0,
        activeWorkOrders: 0,
      });
      ids.team1 = team1.body.data.id;
      ids.team2 = (
        await http()
          .post('/api/v1/field-teams')
          .set(auth.manager)
          .send({ departmentId: ids.works, name: 'Fen İşleri – Ekip 2', code: `T2_${run}` })
          .expect(201)
      ).body.data.id;
      ids.team3 = (
        await http()
          .post('/api/v1/field-teams')
          .set(auth.manager)
          .send({ departmentId: ids.works, name: 'Fen – Kapanacak', code: `T3_${run}` })
          .expect(201)
      ).body.data.id;
      ids.parksTeam = (
        await http()
          .post('/api/v1/field-teams')
          .set(auth.parksManager)
          .send({ departmentId: ids.parks, name: 'Park – Merkez', code: `P1_${run}` })
          .expect(201)
      ).body.data.id;

      await http()
        .post('/api/v1/field-teams')
        .set(auth.manager)
        .send({ departmentId: ids.works, name: 'Kopya', code: `T1_${run}` })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('FIELD_TEAM_CODE_TAKEN'));
      await http()
        .post('/api/v1/field-teams')
        .set(auth.manager)
        .send({ departmentId: ids.parks, name: 'Başka müdürlük', code: `X_${run}` })
        .expect(403);
      await http()
        .post('/api/v1/field-teams')
        .set(auth.field)
        .send({ departmentId: ids.works, name: 'Yetkisiz', code: `Y_${run}` })
        .expect(403);
      // Another tenant's department does not exist here.
      await http()
        .post('/api/v1/field-teams')
        .set(auth.admin)
        .send({ departmentId: ids.bWorks, name: 'Öte', code: `Z_${run}` })
        .expect(404);
    });

    it('accepts only active field staff of the same department as members', async () => {
      const put = (who: Who, teamId: string, members: { userId: string; role: string }[]) =>
        http().put(`/api/v1/field-teams/${teamId}/members`).set(auth[who]).send({ members });

      for (const intruder of [users.bField, users.parksField, users.citizen, users.manager]) {
        const res = await put('manager', ids.team1, [{ userId: intruder.id, role: 'MEMBER' }]);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('FIELD_TEAM_MEMBER_INVALID');
      }
      await put('manager', ids.team1, [
        { userId: users.leader.id, role: 'LEADER' },
        { userId: users.field.id, role: 'LEADER' },
      ]).expect(400);

      const res = await put('manager', ids.team1, [
        { userId: users.leader.id, role: 'LEADER' },
        { userId: users.field.id, role: 'MEMBER' },
        { userId: users.field2.id, role: 'MEMBER' },
      ]).expect(200);
      expect(res.body.data).toMatchObject({
        memberCount: 3,
        leader: { id: users.leader.id },
      });
      await put('manager', ids.team2, [{ userId: users.field2.id, role: 'MEMBER' }]).expect(200);
      await put('parksManager', ids.parksTeam, [
        { userId: users.parksField.id, role: 'LEADER' },
      ]).expect(200);

      // Removing a member keeps the row (leftAt) – membership history is not lost.
      await put('manager', ids.team3, [{ userId: users.field2.id, role: 'MEMBER' }]).expect(200);
      const emptied = await put('manager', ids.team3, []).expect(200);
      expect(emptied.body.data.memberCount).toBe(0);
      const row = await t.prisma.fieldTeamMember.findFirstOrThrow({
        where: { teamId: ids.team3, userId: users.field2.id },
      });
      expect(row.leftAt).not.toBeNull();

      // Managers of another department cannot change these members.
      await put('parksManager', ids.team1, []).expect(404);
      expect(
        await t.prisma.auditLog.count({
          where: {
            action: {
              in: [AuditAction.FIELD_TEAM_CREATED, AuditAction.FIELD_TEAM_MEMBERS_CHANGED],
            },
            entityId: ids.team1,
          },
        }),
      ).toBe(2);
    });

    it('scopes team reads to the department and hides other tenants', async () => {
      const list = await http().get('/api/v1/field-teams').set(auth.manager).expect(200);
      const codes = list.body.data.map((team: { code: string }) => team.code);
      expect(codes).toEqual(expect.arrayContaining([`T1_${run}`, `T2_${run}`]));
      expect(codes).not.toContain(`P1_${run}`);
      const detail = await http().get(`/api/v1/field-teams/${ids.team1}`).set(auth.leader);
      expect(detail.status).toBe(200);
      expect(detail.body.data.members.map((m: { userId: string }) => m.userId)).toEqual(
        expect.arrayContaining([users.leader.id, users.field.id]),
      );
      await http().get(`/api/v1/field-teams/${ids.team1}`).set(auth.parksManager).expect(404);
      await http().get(`/api/v1/field-teams/${ids.team1}`).set(auth.bAdmin).expect(404);
      await http().get('/api/v1/field-teams').set(auth.field).expect(403);
    });

    it('deactivates a team (no hard delete) and updates its name', async () => {
      const res = await http()
        .patch(`/api/v1/field-teams/${ids.team3}`)
        .set(auth.manager)
        .send({ status: 'INACTIVE', name: 'Fen – Pasif' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'INACTIVE', name: 'Fen – Pasif' });
      await http()
        .patch(`/api/v1/field-teams/${ids.team3}`)
        .set(auth.manager)
        .send({ code: 'NEW_CODE' })
        .expect(400);
    });
  });

  // ─── Creation & numbering ────────────────────────────────────────────

  describe('creation', () => {
    it('creates a work order from a routed request and moves the request', async () => {
      const requestId = await readyRequest('citizen');
      ids.request1 = requestId;
      const res = await createWo('manager', requestId, { instructions: 'Asfalt yaması.' }).expect(
        201,
      );
      const wo = res.body.data;
      ids.wo1 = wo.id;
      expect(wo.publicNumber).toMatch(/^WO-\d{4}-\d{6}$/);
      expect(wo).toMatchObject({
        status: 'CREATED',
        priority: 'HIGH',
        description: 'Asfalt yaması.',
        department: { id: ids.works },
        source: { id: requestId, status: 'WORK_ORDER_CREATED' },
        location: SITE,
        fieldTeam: null,
        assignedUser: null,
      });
      expect(wo.sla.dueAt).not.toBeNull();
      expect(wo.timeline[0]).toMatchObject({ type: 'CREATED' });
      expect(await requestStatus(requestId)).toBe('WORK_ORDER_CREATED');

      // The citizen sees a plain-language entry, without staff names or WO internals.
      const citizenView = (await http().get(`/api/v1/requests/${requestId}`).set(auth.citizen)).body
        .data;
      expect(citizenView.timeline.at(-1)).toMatchObject({
        type: 'WORK_ORDER_CREATED',
        description: 'Talebiniz için saha iş emri oluşturuldu.',
        performedBy: null,
      });
      expect(citizenView.workOrders).toEqual([]);
      const staffView = (await http().get(`/api/v1/requests/${requestId}`).set(auth.manager)).body
        .data;
      expect(staffView.workOrders).toEqual([
        { id: wo.id, publicNumber: wo.publicNumber, status: 'CREATED' },
      ]);
      expect(staffView.actions).toMatchObject({
        canCreateWorkOrder: false,
        canChangeDepartment: false,
      });
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.WORK_ORDER_CREATED, entityId: wo.id },
        }),
      ).toBe(1);
    });

    it('refuses a second active work order and requests that are not routed yet', async () => {
      const dup = await createWo('manager', ids.request1).expect(409);
      expect(dup.body.code).toBe('WORK_ORDER_ALREADY_EXISTS');
      const fresh = (await createRequest('manager')).body.data.id;
      const early = await createWo('manager', fresh).expect(409);
      expect(early.body.code).toBe('REQUEST_NOT_READY_FOR_WORK_ORDER');
      // Re-routing is blocked while the work order is active.
      const reroute = await http()
        .patch(`/api/v1/requests/${ids.request1}/department`)
        .set(auth.manager)
        .send({ departmentId: ids.parks })
        .expect(409);
      expect(reroute.body.code).toBe('REQUEST_HAS_ACTIVE_WORK_ORDER');
    });

    it('creates exactly one work order under concurrent requests for the same request', async () => {
      const requestId = await readyRequest();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => createWo('manager', requestId)),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      for (const r of results.filter((x) => x.status === 409)) {
        expect(r.body.code).toBe('WORK_ORDER_ALREADY_EXISTS');
      }
      expect(await t.prisma.workOrder.count({ where: { requestId } })).toBe(1);
    });

    it('numbers concurrent work orders consecutively without gaps or duplicates', async () => {
      const requests = await Promise.all(Array.from({ length: 6 }, () => readyRequest()));
      const created = await Promise.all(requests.map((id) => createWo('manager', id)));
      expect(created.map((r) => r.status)).toEqual(Array(6).fill(201));
      const numbers = created
        .map((r) => Number((r.body.data.publicNumber as string).slice(-6)))
        .sort((x, y) => x - y);
      expect(new Set(numbers).size).toBe(6);
      expect(numbers.at(-1)! - numbers[0]).toBe(5);
    });

    it('enforces permission, department and tenant boundaries on creation', async () => {
      const requestId = await readyRequest();
      await createWo('field', requestId).expect(403);
      await createWo('leader', requestId).expect(403);
      await createWo('parksManager', requestId).expect(404);
      await createWo('bAdmin', requestId).expect(404);
      // Mass assignment: server-owned fields are rejected, not silently accepted.
      await createWo('manager', requestId, { status: 'VERIFIED', departmentId: ids.parks }).expect(
        400,
      );
      expect(await t.prisma.workOrder.count({ where: { requestId } })).toBe(0);
    });

    it('keeps the location snapshot when the request moves', async () => {
      await t.prisma.request.update({
        where: { id: ids.request1 },
        data: { latitude: 36.2, longitude: 36.2 },
      });
      const wo = (await getWo('manager', ids.wo1).expect(200)).body.data;
      expect(wo.location).toEqual(SITE);
      await expect(
        t.prisma.workOrder.update({ where: { id: ids.wo1 }, data: { latitude: 36.2 } }),
      ).rejects.toThrow(/immutable/);
      await t.prisma.request.update({ where: { id: ids.request1 }, data: SITE });
    });
  });

  // ─── Assignment ──────────────────────────────────────────────────────

  describe('assignment', () => {
    it('assigns a team and a member, notifying the assignee', async () => {
      const res = await assign('manager', ids.wo1, {
        fieldTeamId: ids.team1,
        assignedUserId: users.field.id,
        note: 'Acil',
      }).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'ASSIGNED',
        fieldTeam: { id: ids.team1 },
        assignedUser: { id: users.field.id },
      });
      expect(res.body.data.assignments).toHaveLength(1);
      expect(res.body.data.timeline.at(-1)).toMatchObject({ type: 'ASSIGNED' });
      expect(
        await t.prisma.notification.count({
          where: { userId: users.field.id, entityId: ids.wo1, type: 'WORK_ORDER_ASSIGNED' },
        }),
      ).toBe(1);
    });

    it('rejects invalid, inactive, foreign and cross-department assignees', async () => {
      const cases: [Record<string, unknown>, number, string][] = [
        [{ fieldTeamId: ids.team1, assignedUserId: users.parksField.id }, 409, 'ASSIGNEE_INVALID'],
        [{ assignedUserId: users.bField.id }, 409, 'ASSIGNEE_INVALID'],
        [{ assignedUserId: users.citizen.id }, 409, 'ASSIGNEE_INVALID'],
        [{ assignedUserId: users.parksField.id }, 409, 'ASSIGNEE_INVALID'],
        [{ fieldTeamId: ids.parksTeam }, 409, 'ASSIGNEE_INVALID'],
        [{ fieldTeamId: ids.team3 }, 409, 'FIELD_TEAM_INACTIVE'],
        [{ fieldTeamId: randomUUID() }, 404, 'FIELD_TEAM_NOT_FOUND'],
        [{}, 400, 'VALIDATION_FAILED'],
      ];
      for (const [body, status, code] of cases) {
        const res = await assign('manager', ids.wo1, body);
        expect([res.status, res.body.code]).toEqual([status, code]);
      }
      await assign('field', ids.wo1, { assignedUserId: users.field.id }).expect(403);
      await assign('bAdmin', ids.wo1, { assignedUserId: users.bField.id }).expect(404);
    });

    it('keeps the assignment history on reassignment', async () => {
      const { id } = await workOrderAt('ASSIGNED');
      const res = await assign('manager', id, {
        fieldTeamId: ids.team2,
        assignedUserId: users.field2.id,
      }).expect(200);
      const assignments = res.body.data.assignments;
      expect(assignments).toHaveLength(2);
      expect(assignments[0]).toMatchObject({ assignee: { id: users.field.id } });
      expect(assignments[0].unassignedAt).not.toBeNull();
      expect(assignments[1]).toMatchObject({
        assignee: { id: users.field2.id },
        fieldTeam: { id: ids.team2 },
        unassignedAt: null,
      });
      expect(res.body.data.timeline.at(-1)).toMatchObject({ type: 'REASSIGNED' });
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.WORK_ORDER_REASSIGNED, entityId: id },
        }),
      ).toBe(1);
    });

    it('sends accepted work back to ASSIGNED for the new person and refuses reassignment in the field', async () => {
      const accepted = await workOrderAt('ACCEPTED');
      const res = await assign('manager', accepted.id, {
        fieldTeamId: ids.team1,
        assignedUserId: users.field2.id,
      }).expect(200);
      expect(res.body.data.status).toBe('ASSIGNED');
      const working = await workOrderAt('IN_PROGRESS');
      const refused = await assign('manager', working.id, {
        fieldTeamId: ids.team2,
      }).expect(409);
      expect(refused.body.code).toBe('WORK_ORDER_NOT_ASSIGNABLE');
    });

    it('lets team leaders assign only within the teams they lead', async () => {
      const { id } = await workOrderAt('ASSIGNED');
      await assign('leader', id, {
        fieldTeamId: ids.team1,
        assignedUserId: users.field2.id,
      }).expect(200);
      const escape = await assign('leader', id, { fieldTeamId: ids.team2 }).expect(403);
      expect(escape.body.code).toBe('FORBIDDEN');
    });

    it('lets exactly one of two concurrent assignments win', async () => {
      const requestId = await readyRequest();
      const id = (await createWo('manager', requestId).expect(201)).body.data.id;
      const results = await Promise.all([
        assign('manager', id, { fieldTeamId: ids.team1, assignedUserId: users.field.id }),
        assign('manager', id, { fieldTeamId: ids.team2, assignedUserId: users.field2.id }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('WORK_ORDER_STALE');
      expect(await t.prisma.workOrderAssignment.count({ where: { workOrderId: id } })).toBe(1);
    });
  });

  // ─── Access scopes ───────────────────────────────────────────────────

  describe('access scopes', () => {
    const numbersOf = async (who: Who, query = '') => {
      const res = await http().get(`/api/v1/work-orders?pageSize=100${query}`).set(auth[who]);
      expect(res.status).toBe(200);
      return res.body.data.map((w: { id: string }) => w.id) as string[];
    };

    it('shows field staff only their own and their teams’ work', async () => {
      const mine = await numbersOf('field');
      expect(mine).toContain(ids.wo1);
      const rows = await t.prisma.workOrder.findMany({
        where: { id: { in: mine } },
        select: { assignedUserId: true, fieldTeamId: true },
      });
      for (const row of rows) {
        expect(row.assignedUserId === users.field.id || row.fieldTeamId === ids.team1).toBe(true);
      }
      // A filter cannot widen the scope.
      const widened = await numbersOf('outsider', `&assignedUserId=${users.field.id}`);
      expect(widened).toEqual([]);
      await getWo('outsider', ids.wo1).expect(404);
      await getWo('field2', ids.wo1).expect(200); // same team
    });

    it('shows team leaders their teams, managers their department, admins everything', async () => {
      const leaderIds = await numbersOf('leader');
      expect(leaderIds).toContain(ids.wo1);
      const managerIds = await numbersOf('manager');
      expect(managerIds.length).toBeGreaterThanOrEqual(leaderIds.length);
      expect(await numbersOf('parksManager')).toEqual([]);
      await getWo('parksManager', ids.wo1).expect(404);
      await getWo('admin', ids.wo1).expect(200);
      await getWo('bAdmin', ids.wo1).expect(404);
      await http().get('/api/v1/work-orders').set(auth.citizen).expect(403);
      expect(await numbersOf('bAdmin')).not.toContain(ids.wo1);
    });

    it('filters and searches inside the scope', async () => {
      const wo = (await getWo('manager', ids.wo1)).body.data;
      expect(await numbersOf('manager', `&search=${wo.publicNumber}`)).toEqual([ids.wo1]);
      expect(await numbersOf('manager', `&search=${wo.source.publicNumber}`)).toEqual([ids.wo1]);
      const assigned = await numbersOf('manager', '&status=ASSIGNED');
      expect(assigned).toContain(ids.wo1);
      await http().get('/api/v1/work-orders?sort=-password').set(auth.manager).expect(400);
    });
  });

  // ─── Workflow, proximity, media, completion ──────────────────────────

  describe('workflow', () => {
    it('lets only the assignee (or the team leader) take field steps', async () => {
      const notMine = await move('field2', ids.wo1, { to: 'ACCEPTED' }).expect(403);
      expect(notMine.body.code).toBe('NOT_WORK_ORDER_EXECUTOR');
      await move('manager', ids.wo1, { to: 'ACCEPTED' }).expect(403);
      const res = await move('field', ids.wo1, { to: 'ACCEPTED', from: 'ASSIGNED' }).expect(200);
      expect(res.body.data.status).toBe('ACCEPTED');
      expect(res.body.data.dates.acceptedAt).not.toBeNull();
    });

    it('refuses invalid and stale transitions', async () => {
      const invalid = await move('field', ids.wo1, { to: 'COMPLETED' }).expect(409);
      expect(invalid.body).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
        details: { from: 'ACCEPTED', to: 'COMPLETED', allowed: ['EN_ROUTE'] },
      });
      const stale = await move('field', ids.wo1, { to: 'EN_ROUTE', from: 'ASSIGNED' }).expect(409);
      expect(stale.body.code).toBe('WORK_ORDER_STALE');
    });

    it('lets exactly one of two concurrent identical steps succeed', async () => {
      const results = await Promise.all([
        move('field', ids.wo1, { to: 'EN_ROUTE' }),
        move('field', ids.wo1, { to: 'EN_ROUTE' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await t.prisma.workOrderHistory.count({
          where: { workOrderId: ids.wo1, eventType: 'EN_ROUTE' },
        }),
      ).toBe(1);
    });

    it('checks the field position with PostGIS before ON_SITE', async () => {
      const missing = await move('field', ids.wo1, { to: 'ON_SITE' }).expect(400);
      expect(missing.body.code).toBe('FIELD_LOCATION_REQUIRED');
      const far = await move('field', ids.wo1, { to: 'ON_SITE', ...FAR }).expect(409);
      expect(far.body.code).toBe('FIELD_LOCATION_TOO_FAR');
      expect(far.body.details.distanceMeters).toBeGreaterThan(2000);
      expect(far.body.details.radiusMeters).toBe(150);
      const failed = await t.prisma.workOrderHistory.findFirstOrThrow({
        where: { workOrderId: ids.wo1, eventType: 'LOCATION_CHECK_FAILED' },
      });
      expect(failed.latitude).toBeCloseTo(FAR.latitude);
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.WORK_ORDER_LOCATION_REJECTED, entityId: ids.wo1 },
        }),
      ).toBe(1);

      const near = await move('field', ids.wo1, { to: 'ON_SITE', ...NEAR }).expect(200);
      expect(near.body.data.status).toBe('ON_SITE');
      expect(near.body.data.timeline.at(-1).description).toMatch(/Konum doğrulandı \(\d+ m\)/);
    });

    it('uses the municipality radius setting', async () => {
      await t.prisma.municipality.update({
        where: { id: a.municipalityId },
        data: { settings: { onSiteRadiusMeters: 3000 } },
      });
      const { id } = await workOrderAt('ACCEPTED');
      await move('field', id, { to: 'EN_ROUTE' }).expect(200);
      await move('field', id, { to: 'ON_SITE', ...FAR }).expect(200);
      await t.prisma.municipality.update({
        where: { id: a.municipalityId },
        data: { settings: {} },
      });
    });

    it('stores BEFORE / DURING / AFTER evidence through the shared image pipeline', async () => {
      // BEFORE is allowed on site; AFTER only while working.
      const early = await upload('field', ids.wo1, 'AFTER', [
        { buffer: await plainImage('jpeg'), name: 'a.jpg' },
      ]).expect(409);
      expect(early.body.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
      const before = await upload('field', ids.wo1, 'BEFORE', [
        { buffer: await jpegWithMetadata(), name: '../../etc/passwd.jpg' },
      ]).expect(201);
      expect(before.body.data[0]).toMatchObject({ type: 'BEFORE', mimeType: 'image/jpeg' });

      const started = await move('field', ids.wo1, { to: 'IN_PROGRESS', ...NEAR }).expect(200);
      expect(started.body.data.dates.startedAt).not.toBeNull();
      expect(await requestStatus(ids.request1)).toBe('IN_PROGRESS');

      await upload('field', ids.wo1, 'DURING', [
        { buffer: await pngWithMetadata(), name: 'x.png' },
      ]).expect(201);

      const rows = await t.prisma.workOrderMedia.findMany({ where: { workOrderId: ids.wo1 } });
      for (const row of rows) {
        expect(row.storageKey).toMatch(
          new RegExp(
            `^municipalities/${a.municipalityId}/work-orders/${ids.wo1}/(before|during)/[0-9a-f-]{36}\\.(jpg|png)$`,
          ),
        );
        expect(row.storageKey).not.toMatch(/passwd|\.\./);
      }
      // Same metadata stripping as request photos; private bucket, signed URLs only.
      const signed = before.body.data[0].url as string;
      expect(new URL(signed).pathname.startsWith('/kent360-media-test/')).toBe(true);
      const stored = Buffer.from(await (await fetch(signed)).arrayBuffer());
      expect(await metadataTraces(stored)).toEqual([]);
      const meta = await sharp(stored).metadata();
      expect([meta.width, meta.height]).toEqual([20, 40]); // orientation applied
      expect((await fetch(signed.split('?')[0])).status).toBe(403);

      const spoof = await upload('field', ids.wo1, 'DURING', [
        { buffer: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]), name: 'x.jpg' },
      ]).expect(415);
      expect(spoof.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      await upload('field', ids.wo1, 'DURING', [
        { buffer: await animatedWebp(), name: 'anim.webp' },
      ]).expect(415);
    });

    it('protects evidence photos like the work order itself', async () => {
      const mediaId = (
        await t.prisma.workOrderMedia.findFirstOrThrow({ where: { workOrderId: ids.wo1 } })
      ).id;
      const file = [{ buffer: await plainImage('jpeg'), name: 'x.jpg' }];
      await upload('outsider', ids.wo1, 'DURING', file).expect(404);
      await upload('bField', ids.wo1, 'DURING', file).expect(404);
      await upload('manager', ids.wo1, 'DURING', file).expect(403);
      const colleague = await upload('field2', ids.wo1, 'DURING', file).expect(403);
      expect(colleague.body.code).toBe('NOT_WORK_ORDER_EXECUTOR');
      await upload('field', ids.wo1, 'NOPE', file).expect(400);
      await http()
        .get(`/api/v1/work-orders/${ids.wo1}/media/${mediaId}/url`)
        .set(auth.outsider)
        .expect(404);
      await http()
        .get(`/api/v1/work-orders/${ids.wo1}/media/${mediaId}/url`)
        .set(auth.leader)
        .expect(200);
    });

    it('requires a completion description and an AFTER photo', async () => {
      const noText = await move('field', ids.wo1, { to: 'COMPLETED' }).expect(400);
      expect(noText.body.code).toBe('COMPLETION_DESCRIPTION_REQUIRED');
      const noPhoto = await move('field', ids.wo1, {
        to: 'COMPLETED',
        completionDescription: 'Çukur asfaltla kapatıldı.',
      }).expect(409);
      expect(noPhoto.body.code).toBe('AFTER_PHOTO_REQUIRED');
      expect((await getWo('field', ids.wo1)).body.data.status).toBe('IN_PROGRESS');

      await upload('field', ids.wo1, 'AFTER', [
        { buffer: await webpWithMetadata(), name: 'after.webp' },
      ]).expect(201);
    });

    it('completes once under concurrent requests and resolves the request', async () => {
      const body = { to: 'COMPLETED', completionDescription: 'Çukur asfaltla kapatıldı.' };
      const results = await Promise.all([
        move('field', ids.wo1, body),
        move('field', ids.wo1, body),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const done = results.find((r) => r.status === 200)!.body.data;
      expect(done).toMatchObject({
        status: 'COMPLETED',
        completionDescription: 'Çukur asfaltla kapatıldı.',
      });
      expect(done.dates.completedAt).not.toBeNull();
      expect(done.actions.canUploadMedia).toEqual([]);
      const request = await t.prisma.request.findUniqueOrThrow({ where: { id: ids.request1 } });
      expect(request.status).toBe('RESOLVED');
      expect(request.resolvedAt).not.toBeNull();
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.WORK_ORDER_COMPLETED, entityId: ids.wo1 },
        }),
      ).toBe(1);
    });

    it('freezes completed evidence – no silent changes', async () => {
      const late = await upload('field', ids.wo1, 'AFTER', [
        { buffer: await plainImage('png'), name: 'late.png' },
      ]).expect(409);
      expect(late.body.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
      await expect(
        t.prisma.workOrder.update({
          where: { id: ids.wo1 },
          data: { completionDescription: 'Değiştirildi' },
        }),
      ).rejects.toThrow(/immutable/);
      const mediaId = (
        await t.prisma.workOrderMedia.findFirstOrThrow({ where: { workOrderId: ids.wo1 } })
      ).id;
      await expect(
        t.prisma.workOrderMedia.update({ where: { id: mediaId }, data: { sizeBytes: 1 } }),
      ).rejects.toThrow(/cannot be modified/);
    });

    it('lets the manager verify (not the field staff) and then close the request', async () => {
      await move('field', ids.wo1, { to: 'VERIFIED' }).expect(403);
      const res = await move('manager', ids.wo1, { to: 'VERIFIED' }).expect(200);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.actions.transitions).toEqual([]);
      expect(await requestStatus(ids.request1)).toBe('VERIFIED');
      await move('manager', ids.wo1, { to: 'IN_PROGRESS', reason: 'x' }).expect(409);

      const closed = await http()
        .post(`/api/v1/requests/${ids.request1}/transitions`)
        .set(auth.manager)
        .send({ to: 'CLOSED' })
        .expect(200);
      expect(closed.body.data.status).toBe('CLOSED');

      const citizenTimeline = (
        await http().get(`/api/v1/requests/${ids.request1}`).set(auth.citizen)
      ).body.data.timeline.map((e: { description: string }) => e.description);
      expect(citizenTimeline).toEqual(
        expect.arrayContaining([
          'Saha ekibi çalışmaya başladı.',
          'Saha çalışması tamamlandı, sorun giderildi.',
          'Çözüm belediye tarafından doğrulandı.',
        ]),
      );
      expect(
        await t.prisma.auditLog.count({
          where: { action: AuditAction.WORK_ORDER_VERIFIED, entityId: ids.wo1 },
        }),
      ).toBe(1);
    });

    it('pauses, resumes on site, and returns completed work to the field', async () => {
      const { id, requestId } = await workOrderAt('IN_PROGRESS');
      await move('field', id, { to: 'WAITING' }).expect(400);
      await move('field', id, { to: 'WAITING', reason: 'Malzeme bekleniyor' }).expect(200);
      await move('field', id, { to: 'IN_PROGRESS' }).expect(400); // position needed to resume
      await move('field', id, { to: 'IN_PROGRESS', ...NEAR }).expect(200);
      await upload('field', id, 'AFTER', [{ buffer: await plainImage('jpeg'), name: 'a.jpg' }]);
      await move('field', id, { to: 'COMPLETED', completionDescription: 'Tamam.' }).expect(200);
      expect(await requestStatus(requestId)).toBe('RESOLVED');

      await move('manager', id, { to: 'IN_PROGRESS' }).expect(400);
      const back = await move('manager', id, { to: 'IN_PROGRESS', reason: 'Yama eksik' }).expect(
        200,
      );
      expect(back.body.data.status).toBe('IN_PROGRESS');
      expect(back.body.data.timeline.at(-1)).toMatchObject({ type: 'RETURNED' });
      const request = await t.prisma.request.findUniqueOrThrow({ where: { id: requestId } });
      expect([request.status, request.resolvedAt]).toEqual(['IN_PROGRESS', null]);
    });

    it('cancels early work and lets the department plan a new work order', async () => {
      const { id, requestId } = await workOrderAt('ASSIGNED');
      await move('manager', id, { to: 'CANCELLED' }).expect(400);
      await move('field', id, { to: 'CANCELLED', reason: 'x' }).expect(403);
      const res = await move('manager', id, { to: 'CANCELLED', reason: 'Mükerrer iş' }).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'Mükerrer iş',
      });
      expect(await requestStatus(requestId)).toBe('ASSIGNED_TO_DEPARTMENT');
      await createWo('manager', requestId).expect(201);
    });

    it('audits every step with sanitised entries', async () => {
      const actions = (
        await t.prisma.auditLog.findMany({
          where: {
            municipalityId: a.municipalityId,
            entityType: { in: ['WorkOrder', 'FieldTeam'] },
          },
          select: { action: true },
        })
      ).map((row) => row.action);
      for (const action of [
        AuditAction.WORK_ORDER_CREATED,
        AuditAction.WORK_ORDER_ASSIGNED,
        AuditAction.WORK_ORDER_REASSIGNED,
        AuditAction.WORK_ORDER_STATUS_CHANGED,
        AuditAction.WORK_ORDER_MEDIA_ADDED,
        AuditAction.WORK_ORDER_COMPLETED,
        AuditAction.WORK_ORDER_VERIFIED,
        AuditAction.WORK_ORDER_CANCELLED,
        AuditAction.FIELD_TEAM_CREATED,
        AuditAction.FIELD_TEAM_UPDATED,
        AuditAction.FIELD_TEAM_MEMBERS_CHANGED,
      ]) {
        expect(actions).toContain(action);
      }
    });
  });
});
