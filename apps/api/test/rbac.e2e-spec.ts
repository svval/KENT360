import { randomUUID } from 'node:crypto';
import { ALL_PERMISSIONS, AuditAction, RoleCode } from '@kent360/shared-types';
import {
  bearer,
  cookie,
  createTenant,
  createTestApp,
  login,
  PASSWORD,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

describe('RBAC, tenant isolation and audit (e2e)', () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  const tokens: Record<string, string> = {};
  /** Every credential the suite handled – none may appear in audit_logs. */
  const secrets: string[] = [PASSWORD];

  const as = (who: string) => bearer(tokens[who]);

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t.prisma, 'Alfa');
    b = await createTenant(t.prisma, 'Beta');
    for (const [key, tenant] of [
      ['a', a],
      ['b', b],
    ] as const) {
      for (const role of ['admin', 'manager', 'field', 'citizen'] as const) {
        const session = await login(t, tenant.users[role].email);
        tokens[`${key}.${role}`] = session.accessToken;
        secrets.push(session.accessToken, session.refreshToken);
      }
    }
  });

  afterAll(async () => {
    await t.close();
  });

  const systemRoleId = async (code: RoleCode) =>
    (await t.prisma.role.findFirstOrThrow({ where: { municipalityId: null, code } })).id;

  describe('permissions', () => {
    it('allows holders of the permission', async () => {
      await t.http().get('/api/v1/users').set(as('a.admin')).expect(200);
      await t.http().get('/api/v1/users').set(as('a.manager')).expect(200); // users.read
      await t.http().get('/api/v1/roles').set(as('a.admin')).expect(200); // roles.manage
    });

    it('denies with 403 FORBIDDEN otherwise', async () => {
      const denied = await t.http().get('/api/v1/users').set(as('a.field')).expect(403);
      expect(denied.body).toMatchObject({ success: false, code: 'FORBIDDEN' });

      await t.http().get('/api/v1/users').set(as('a.citizen')).expect(403);
      await t.http().get('/api/v1/roles').set(as('a.manager')).expect(403);
      await t
        .http()
        .post('/api/v1/users')
        .set(as('a.manager')) // has users.read but not users.manage
        .send({ email: 'x@alfa.test', firstName: 'X', lastName: 'Y', password: 'Long-enough-1' })
        .expect(403);
    });

    it('requires authentication before authorisation', async () => {
      await t.http().get('/api/v1/users').expect(401);
    });

    it('applies role changes immediately, without a new login', async () => {
      const field = a.users.field;
      await t.http().get('/api/v1/users').set(as('a.field')).expect(403);
      await t
        .http()
        .put(`/api/v1/users/${field.id}/roles`)
        .set(as('a.admin'))
        .send({
          roleIds: [
            await systemRoleId(RoleCode.FIELD_STAFF),
            await systemRoleId(RoleCode.DEPARTMENT_MANAGER),
          ],
        })
        .expect(200);
      await t.http().get('/api/v1/users').set(as('a.field')).expect(200);

      const [audit] = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.USER_ROLE_CHANGED, entityId: field.id },
      });
      expect(audit.beforeData).toEqual({ roles: ['FIELD_STAFF'] });
      expect((audit.afterData as { roles: string[] }).roles.sort()).toEqual([
        'DEPARTMENT_MANAGER',
        'FIELD_STAFF',
      ]);
    });
  });

  describe('tenant isolation', () => {
    it('lists only users of the caller municipality', async () => {
      const res = await t.http().get('/api/v1/users?pageSize=100').set(as('a.admin')).expect(200);
      const emails = res.body.data.map((u: { email: string }) => u.email);
      expect(emails).toEqual(expect.arrayContaining([a.users.admin.email, a.users.citizen.email]));
      expect(emails.some((e: string) => e.endsWith('@beta.test'))).toBe(false);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100, total: emails.length });
    });

    it('answers 404 for another municipality’s user, on read and on write', async () => {
      const foreign = b.users.manager.id;
      const read = await t.http().get(`/api/v1/users/${foreign}`).set(as('a.admin')).expect(404);
      expect(read.body.code).toBe('USER_NOT_FOUND');

      await t
        .http()
        .patch(`/api/v1/users/${foreign}`)
        .set(as('a.admin'))
        .send({ status: 'DISABLED' })
        .expect(404);
      await t
        .http()
        .put(`/api/v1/users/${foreign}/roles`)
        .set(as('a.admin'))
        .send({ roleIds: [] })
        .expect(404);

      const untouched = await t.prisma.user.findUniqueOrThrow({ where: { id: foreign } });
      expect(untouched.status).toBe('ACTIVE');
    });

    it('keeps custom roles private to their municipality', async () => {
      const created = await t
        .http()
        .post('/api/v1/roles')
        .set(as('b.admin'))
        .send({ code: 'PARK_INSPECTOR', name: 'Park Denetçisi', permissions: ['requests.read'] })
        .expect(201);
      const betaRole = created.body.data.id as string;

      const list = await t.http().get('/api/v1/roles').set(as('a.admin')).expect(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(betaRole);

      await t
        .http()
        .put(`/api/v1/roles/${betaRole}/permissions`)
        .set(as('a.admin'))
        .send({ permissions: ['users.manage'] })
        .expect(404);
      const assign = await t
        .http()
        .put(`/api/v1/users/${a.users.citizen.id}/roles`)
        .set(as('a.admin'))
        .send({ roleIds: [betaRole] })
        .expect(404);
      expect(assign.body.code).toBe('ROLE_NOT_FOUND');

      // The same code is still available to another municipality.
      await t
        .http()
        .post('/api/v1/roles')
        .set(as('a.admin'))
        .send({ code: 'PARK_INSPECTOR', name: 'Park Denetçisi', permissions: [] })
        .expect(201);
    });

    it('counts only own users on shared system roles', async () => {
      const res = await t.http().get('/api/v1/roles').set(as('a.admin')).expect(200);
      const admins = res.body.data.find((r: { code: string }) => r.code === 'SYSTEM_ADMIN');
      expect(admins).toMatchObject({ isSystem: true, userCount: 1 });
    });
  });

  describe('user management', () => {
    it('creates a user (audited, password never echoed) who can then log in', async () => {
      const password = 'Brand-New-Pass-1';
      const local = `new.person.${randomUUID().slice(0, 8)}`;
      secrets.push(password);
      const res = await t
        .http()
        .post('/api/v1/users')
        .set(as('a.admin'))
        .send({
          email: `${local.toUpperCase()}@Alfa.test`,
          firstName: ' Ayşe ',
          lastName: 'Yılmaz',
          password,
          roleIds: [await systemRoleId(RoleCode.FIELD_STAFF)],
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        email: `${local}@alfa.test`,
        firstName: 'Ayşe',
        roles: [{ code: 'FIELD_STAFF' }],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

      const [audit] = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.USER_CREATED, entityId: res.body.data.id },
      });
      expect(audit).toMatchObject({ municipalityId: a.municipalityId, userId: a.users.admin.id });
      await login(t, `${local}@alfa.test`, password);
    });

    it('rejects duplicate e-mails and weak passwords', async () => {
      const dup = await t
        .http()
        .post('/api/v1/users')
        .set(as('a.admin'))
        .send({
          email: a.users.field.email,
          firstName: 'A',
          lastName: 'B',
          password: 'Long-enough-1',
        })
        .expect(409);
      expect(dup.body.code).toBe('EMAIL_TAKEN');

      const weak = await t
        .http()
        .post('/api/v1/users')
        .set(as('a.admin'))
        .send({ email: 'weak@alfa.test', firstName: 'A', lastName: 'B', password: 'short' })
        .expect(400);
      expect(weak.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects unknown sort fields and unexpected body fields', async () => {
      await t.http().get('/api/v1/users?sort=passwordHash').set(as('a.admin')).expect(400);
      await t
        .http()
        .patch(`/api/v1/users/${a.users.citizen.id}`)
        .set(as('a.admin'))
        .send({ passwordHash: 'x' })
        .expect(400);
    });

    it('deactivating a user ends their sessions immediately (audited)', async () => {
      const victim = await login(t, a.users.citizen.email);
      await t.http().get('/api/v1/auth/me').set(bearer(victim.accessToken)).expect(200);

      await t
        .http()
        .patch(`/api/v1/users/${a.users.citizen.id}`)
        .set(as('a.admin'))
        .send({ status: 'SUSPENDED' })
        .expect(200);

      await t.http().get('/api/v1/auth/me').set(bearer(victim.accessToken)).expect(401);
      await t.http().post('/api/v1/auth/refresh').set(cookie(victim.refreshToken)).expect(401);
      const [audit] = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.USER_STATUS_CHANGED, entityId: a.users.citizen.id },
      });
      expect(audit.beforeData).toEqual({ status: 'ACTIVE' });
      expect(audit.afterData).toMatchObject({ status: 'SUSPENDED' });
    });

    it('forbids changing one’s own status or roles', async () => {
      const self = a.users.admin.id;
      const res = await t
        .http()
        .patch(`/api/v1/users/${self}`)
        .set(as('a.admin'))
        .send({ status: 'DISABLED' })
        .expect(409);
      expect(res.body.code).toBe('SELF_MODIFICATION_FORBIDDEN');
      await t
        .http()
        .put(`/api/v1/users/${self}/roles`)
        .set(as('a.admin'))
        .send({ roleIds: [] })
        .expect(409);
    });
  });

  describe('roles', () => {
    it('changes permissions of a custom role (audited) but never of a system role', async () => {
      const role = await t
        .http()
        .post('/api/v1/roles')
        .set(as('a.admin'))
        .send({ code: 'REPORTER', name: 'Raporlayıcı', permissions: ['reports.export'] })
        .expect(201);

      const updated = await t
        .http()
        .put(`/api/v1/roles/${role.body.data.id}/permissions`)
        .set(as('a.admin'))
        .send({ permissions: ['analytics.read', 'reports.export'] })
        .expect(200);
      expect(updated.body.data.permissions).toEqual(['analytics.read', 'reports.export']);

      const [audit] = await t.prisma.auditLog.findMany({
        where: { action: AuditAction.ROLE_PERMISSION_CHANGED, entityId: role.body.data.id },
      });
      expect(audit.beforeData).toEqual({ permissions: ['reports.export'] });
      expect(audit.afterData).toEqual({ permissions: ['analytics.read', 'reports.export'] });

      const system = await t
        .http()
        .put(`/api/v1/roles/${await systemRoleId(RoleCode.CITIZEN)}/permissions`)
        .set(as('a.admin'))
        .send({ permissions: ['users.manage'] })
        .expect(409);
      expect(system.body.code).toBe('SYSTEM_ROLE_IMMUTABLE');

      await t
        .http()
        .post('/api/v1/roles')
        .set(as('a.admin'))
        .send({ code: 'SYSTEM_ADMIN', name: 'Sahte', permissions: [] })
        .expect(409);
      await t
        .http()
        .put(`/api/v1/roles/${role.body.data.id}/permissions`)
        .set(as('a.admin'))
        .send({ permissions: ['not.a.permission'] })
        .expect(400);
    });

    it('exposes the permission catalogue', async () => {
      const res = await t.http().get('/api/v1/permissions').set(as('a.admin')).expect(200);
      expect(res.body.data).toHaveLength(ALL_PERMISSIONS.length);
      expect(res.body.data[0]).toEqual({
        code: expect.any(String),
        name: expect.any(String),
        group: expect.any(String),
      });
    });
  });

  describe('audit trail', () => {
    it('never contains passwords, hashes or tokens', async () => {
      const rows = await t.prisma.auditLog.findMany();
      expect(rows.length).toBeGreaterThan(10);
      const dump = JSON.stringify(rows);
      for (const secret of secrets) expect(dump).not.toContain(secret);
      expect(dump).not.toMatch(/\$argon2|eyJhbGci/);
    });

    it('is append-only in the database', async () => {
      const row = await t.prisma.auditLog.findFirstOrThrow();
      await expect(
        t.prisma.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } }),
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
