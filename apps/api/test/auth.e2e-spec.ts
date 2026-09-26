import { AuditAction } from '@kent360/shared-types';
import {
  bearer,
  cookie,
  createTenant,
  createTestApp,
  login,
  PASSWORD,
  refreshCookieOf,
  type TenantFixture,
  type TestApp,
} from './support/test-app';

describe('Auth (e2e)', () => {
  let t: TestApp;
  let tenant: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t.prisma, 'Auth');
  });

  afterAll(async () => {
    await t.close();
  });

  const auditOf = (action: string, userId: string) =>
    t.prisma.auditLog.findMany({ where: { action, userId }, orderBy: { createdAt: 'asc' } });

  describe('login', () => {
    it('logs in with e-mail + password and issues tokens safely', async () => {
      const { email, id } = tenant.users.admin;
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD })
        .expect(200);

      expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(res.body.data.user).toMatchObject({ id, email, status: 'ACTIVE' });
      expect(res.body.data.user.permissions).toContain('users.manage');
      expect(res.body.data).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

      const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(setCookie).toMatch(/kent360_rt=[A-Za-z0-9_-]{43}/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Strict/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);

      // Only a keyed hash of the refresh token is stored.
      const raw = refreshCookieOf(res)!;
      const stored = await t.prisma.refreshToken.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      });
      expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored!.tokenHash).not.toContain(raw);
      expect(stored!.userAgent).toBeDefined();

      const user = await t.prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.lastLoginAt).not.toBeNull();
      expect(await auditOf(AuditAction.LOGIN_SUCCESS, id)).toHaveLength(1);
    });

    it('rejects a wrong password with a generic message and counts the failure', async () => {
      const { email, id } = tenant.users.manager;
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);

      expect(res.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'E-posta veya şifre hatalı.',
      });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id } })).failedLoginCount).toBe(1);
      const [audit] = await auditOf(AuditAction.LOGIN_FAILED, id);
      expect(audit.afterData).toEqual({ reason: 'INVALID_PASSWORD', failedLoginCount: 1 });
      expect(JSON.stringify(audit)).not.toContain('wrong-password');
    });

    it('answers an unknown account exactly like a wrong password (no enumeration)', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@auth.test', password: PASSWORD })
        .expect(401);
      expect(res.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'E-posta veya şifre hatalı.',
      });
    });

    it('refuses an inactive user – revealing the status only with the right password', async () => {
      const { email, id } = tenant.users.disabled;
      await t.http().post('/api/v1/auth/login').send({ email, password: 'nope' }).expect(401);

      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_DISABLED');
      expect(await t.prisma.refreshToken.count({ where: { userId: id } })).toBe(0);
    });

    it('locks the account after 10 consecutive failures', async () => {
      const { email, id } = tenant.users.citizen;
      for (let i = 0; i < 10; i += 1) {
        await t
          .http()
          .post('/api/v1/auth/login')
          .send({ email, password: `bad-${i}` })
          .expect(401);
      }
      const locked = await t.prisma.user.findUniqueOrThrow({ where: { id } });
      expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(await auditOf(AuditAction.ACCOUNT_LOCKED, id)).toHaveLength(1);

      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(423);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');

      // Unlock for later tests.
      await t.prisma.user.update({
        where: { id },
        data: { lockedUntil: null, failedLoginCount: 0 },
      });
    });

    it('validates the request body', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('access token', () => {
    it('authenticates /auth/me and rejects missing, malformed or tampered tokens', async () => {
      const { accessToken } = await login(t, tenant.users.field.email);
      const me = await t.http().get('/api/v1/auth/me').set(bearer(accessToken)).expect(200);
      expect(me.body.data).toMatchObject({
        email: tenant.users.field.email,
        roles: [{ code: 'FIELD_STAFF', name: 'Saha Personeli' }],
        municipality: { id: tenant.municipalityId },
      });

      await t.http().get('/api/v1/auth/me').expect(401);
      await t.http().get('/api/v1/auth/me').set({ Authorization: accessToken }).expect(401);
      const [h, p, s] = accessToken.split('.');
      const forged = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(p, 'base64url').toString()),
          sub: tenant.users.admin.id,
        }),
      ).toString('base64url');
      await t
        .http()
        .get('/api/v1/auth/me')
        .set(bearer(`${h}.${forged}.${s}`))
        .expect(401);
    });
  });

  describe('refresh rotation', () => {
    it('rotates: new tokens are issued and the old refresh token is retired', async () => {
      const first = await login(t, tenant.users.manager.email);
      const res = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(cookie(first.refreshToken))
        .expect(200);
      const rotated = refreshCookieOf(res)!;

      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(first.refreshToken);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      await t.http().get('/api/v1/auth/me').set(bearer(res.body.data.accessToken)).expect(200);

      const tokens = await t.prisma.refreshToken.findMany({
        where: { userId: tenant.users.manager.id },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      expect(tokens[0].familyId).toBe(tokens[1].familyId);
      expect(tokens[1].revokedAt).not.toBeNull();
      expect(tokens[1].replacedById).toBe(tokens[0].id);
      expect(tokens[0].revokedAt).toBeNull();
    });

    it('detects reuse of a rotated token and revokes the whole session', async () => {
      const first = await login(t, tenant.users.field.email);
      const second = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(cookie(first.refreshToken))
        .expect(200);
      const current = refreshCookieOf(second)!;

      // Attacker replays the stolen, already-rotated token.
      const replay = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(cookie(first.refreshToken))
        .expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');

      // The legitimate chain is dead too, and so is its access token.
      await t.http().post('/api/v1/auth/refresh').set(cookie(current)).expect(401);
      await t.http().get('/api/v1/auth/me').set(bearer(second.body.data.accessToken)).expect(401);
      const reuse = await auditOf(AuditAction.REFRESH_TOKEN_REUSE_DETECTED, tenant.users.field.id);
      expect(reuse.length).toBeGreaterThanOrEqual(1);
    });

    it('lets only one of two concurrent refreshes with the same token win', async () => {
      const { refreshToken } = await login(t, tenant.users.admin.email);
      const results = await Promise.all([
        t.http().post('/api/v1/auth/refresh').set(cookie(refreshToken)),
        t.http().post('/api/v1/auth/refresh').set(cookie(refreshToken)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('rejects a missing or unknown refresh token and clears the cookie', async () => {
      await t.http().post('/api/v1/auth/refresh').expect(401);
      const res = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(cookie('x'.repeat(43)))
        .expect(401);
      expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/kent360_rt=;/);
    });
  });

  describe('logout', () => {
    it('ends the current session: refresh and access token stop working', async () => {
      const session = await login(t, tenant.users.manager.email);
      const res = await t
        .http()
        .post('/api/v1/auth/logout')
        .set(cookie(session.refreshToken))
        .expect(200);
      expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/kent360_rt=;/);

      await t.http().post('/api/v1/auth/refresh').set(cookie(session.refreshToken)).expect(401);
      await t.http().get('/api/v1/auth/me').set(bearer(session.accessToken)).expect(401);
      expect((await auditOf(AuditAction.LOGOUT, tenant.users.manager.id)).length).toBeGreaterThan(
        0,
      );
    });

    it('is idempotent without a cookie', async () => {
      await t.http().post('/api/v1/auth/logout').expect(200);
    });

    it('logout-all ends every session of the user', async () => {
      const { email, id } = tenant.users.citizen;
      const a = await login(t, email);
      const b = await login(t, email);

      const res = await t
        .http()
        .post('/api/v1/auth/logout-all')
        .set(bearer(a.accessToken))
        .expect(200);
      expect(res.body.data.revokedSessions).toBeGreaterThanOrEqual(2);

      for (const s of [a, b]) {
        await t.http().get('/api/v1/auth/me').set(bearer(s.accessToken)).expect(401);
        await t.http().post('/api/v1/auth/refresh').set(cookie(s.refreshToken)).expect(401);
      }
      expect(await auditOf(AuditAction.LOGOUT_ALL, id)).toHaveLength(1);
    });

    it('lists sessions and revokes one of them', async () => {
      const { email } = tenant.users.admin;
      const cleanup = await login(t, email); // end sessions left by earlier tests
      await t.http().post('/api/v1/auth/logout-all').set(bearer(cleanup.accessToken)).expect(200);
      const laptop = await login(t, email);
      const phone = await login(t, email);

      const list = await t
        .http()
        .get('/api/v1/auth/sessions')
        .set(bearer(laptop.accessToken))
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      const other = list.body.data.find((s: { current: boolean }) => !s.current);
      expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

      await t
        .http()
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set(bearer(laptop.accessToken))
        .expect(200);
      await t.http().get('/api/v1/auth/me').set(bearer(phone.accessToken)).expect(401);
      await t.http().get('/api/v1/auth/me').set(bearer(laptop.accessToken)).expect(200);
      await t
        .http()
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set(bearer(laptop.accessToken))
        .expect(404);
    });
  });
});
