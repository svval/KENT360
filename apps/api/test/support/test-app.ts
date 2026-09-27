import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleCode, UserStatus } from '@kent360/shared-types';
import request from 'supertest';
import { type App } from 'supertest/types';
import { seedRbac } from '../../prisma/seed-data';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { hashPassword } from '../../src/modules/auth/domain/password-policy';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'Test-Password-2026';

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Boots the full application exactly like main.ts (same pipes, prefix, guards). */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await seedRbac(prisma);
  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export interface TenantFixture {
  municipalityId: string;
  users: Record<
    'admin' | 'manager' | 'field' | 'citizen' | 'disabled',
    { id: string; email: string }
  >;
}

let passwordHash: Promise<string> | undefined;

/** A municipality with one user per relevant role; e-mails are unique per call. */
export async function createTenant(prisma: PrismaService, label: string): Promise<TenantFixture> {
  const suffix = randomUUID().slice(0, 8);
  const municipality = await prisma.municipality.create({
    data: { name: `${label} Belediyesi`, slug: `${label.toLowerCase()}-${suffix}`, city: 'Test' },
  });
  const roles = new Map(
    (await prisma.role.findMany({ where: { municipalityId: null } })).map((r) => [r.code, r.id]),
  );
  passwordHash ??= hashPassword(PASSWORD);
  const hash = await passwordHash;

  const make = async (key: string, role: RoleCode, status: UserStatus = UserStatus.ACTIVE) => {
    const email = `${key}.${suffix}@${label.toLowerCase()}.test`;
    const user = await prisma.user.create({
      data: {
        municipalityId: municipality.id,
        email,
        firstName: key,
        lastName: label,
        passwordHash: hash,
        status,
        roles: { create: [{ roleId: roles.get(role)! }] },
      },
    });
    return { id: user.id, email };
  };

  return {
    municipalityId: municipality.id,
    users: {
      admin: await make('admin', RoleCode.SYSTEM_ADMIN),
      manager: await make('manager', RoleCode.DEPARTMENT_MANAGER),
      field: await make('field', RoleCode.FIELD_STAFF),
      citizen: await make('citizen', RoleCode.CITIZEN),
      disabled: await make('disabled', RoleCode.DEPARTMENT_MANAGER, UserStatus.DISABLED),
    },
  };
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  body: Record<string, unknown>;
}

export function refreshCookieOf(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((c) => c.startsWith('kent360_rt='));
  return cookie?.split(';')[0].slice('kent360_rt='.length) || undefined;
}

export async function login(t: TestApp, email: string, password = PASSWORD): Promise<LoginResult> {
  const res = await t.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
  return {
    accessToken: res.body.data.accessToken as string,
    refreshToken: refreshCookieOf(res)!,
    body: res.body.data as Record<string, unknown>,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const cookie = (refreshToken: string) => ({ Cookie: `kent360_rt=${refreshToken}` });

/** An extra user in an existing tenant, optionally attached to a department. */
export async function addUser(
  prisma: PrismaService,
  municipalityId: string,
  key: string,
  role: RoleCode,
  departmentId: string | null = null,
): Promise<{ id: string; email: string }> {
  const roleRow = await prisma.role.findFirstOrThrow({
    where: { municipalityId: null, code: role },
  });
  passwordHash ??= hashPassword(PASSWORD);
  const email = `${key}.${randomUUID().slice(0, 8)}@extra.test`;
  const user = await prisma.user.create({
    data: {
      municipalityId,
      departmentId,
      email,
      firstName: key,
      lastName: 'Test',
      passwordHash: await passwordHash,
      roles: { create: [{ roleId: roleRow.id }] },
    },
  });
  return { id: user.id, email };
}

/**
 * Minimal files whose first bytes carry the real format signatures (the API decides by
 * signature, not by name or declared type).
 */
export const IMAGES = {
  jpeg: Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0'),
    Buffer.alloc(64, 1),
  ]),
  png: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 2),
  ]),
  webp: Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x40, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
    Buffer.alloc(64, 3),
  ]),
  gif: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64, 4)]),
};
