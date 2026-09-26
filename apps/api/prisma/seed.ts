/**
 * KENT360 development seed – idempotent, safe to run repeatedly (`npm run db:seed`).
 *
 * Foundation scope: the RBAC catalogue (permissions, system roles, role→permission
 * mappings, all derived from @kent360/shared-types) and the demo municipality.
 * Departments, neighbourhoods, categories, users and requests are added by
 * Phase 4–6 (see docs/DEVELOPMENT_ROADMAP.md and docs/DEMO_SCENARIO.md).
 *
 * Never run against a production database.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
  RoleCode,
} from '@kent360/shared-types';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
loadEnv({ quiet: true });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run the development seed with NODE_ENV=production.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (copy .env.example to .env).');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PERMISSION_NAMES: Record<Permission, string> = {
  'requests.read': 'Talepleri görüntüleme',
  'requests.readOwn': 'Kendi taleplerini görüntüleme',
  'requests.create': 'Talep oluşturma',
  'requests.update': 'Talep güncelleme',
  'requests.assign': 'Talep yönlendirme',
  'workOrders.read': 'İş emirlerini görüntüleme',
  'workOrders.readAssigned': 'Atanan iş emirlerini görüntüleme',
  'workOrders.create': 'İş emri oluşturma',
  'workOrders.assign': 'İş emri atama',
  'workOrders.execute': 'İş emri yürütme',
  'workOrders.complete': 'İş emri tamamlama',
  'workOrders.verify': 'İş emri doğrulama',
  'fieldTeams.read': 'Saha ekiplerini görüntüleme',
  'fieldTeams.manage': 'Saha ekiplerini yönetme',
  'departments.manage': 'Müdürlükleri yönetme',
  'categories.manage': 'Kategorileri yönetme',
  'neighborhoods.manage': 'Mahalleleri yönetme',
  'users.read': 'Kullanıcıları görüntüleme',
  'users.manage': 'Kullanıcıları yönetme',
  'roles.manage': 'Rol ve yetkileri yönetme',
  'analytics.read': 'Analitik görüntüleme',
  'reports.export': 'Rapor dışa aktarma',
  'audit.read': 'Denetim kayıtlarını görüntüleme',
  'settings.manage': 'Sistem ayarlarını yönetme',
};

const ROLE_NAMES: Record<RoleCode, { name: string; description: string }> = {
  [RoleCode.CITIZEN]: {
    name: 'Vatandaş',
    description: 'Talep oluşturur ve kendi taleplerini izler.',
  },
  [RoleCode.FIELD_STAFF]: {
    name: 'Saha Personeli',
    description: 'Kendisine atanan iş emirlerini yürütür.',
  },
  [RoleCode.TEAM_LEADER]: {
    name: 'Ekip Sorumlusu',
    description: 'Ekibine iş emri dağıtır ve takip eder.',
  },
  [RoleCode.DEPARTMENT_MANAGER]: {
    name: 'Müdürlük Yöneticisi',
    description: 'Müdürlüğe gelen talepleri ve iş emirlerini yönetir.',
  },
  [RoleCode.SYSTEM_ADMIN]: {
    name: 'Sistem Yöneticisi',
    description: 'Kullanıcı, rol, ayar ve denetim kayıtlarını yönetir.',
  },
};

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const code of ALL_PERMISSIONS) {
    const data = { name: PERMISSION_NAMES[code], group: code.split('.')[0] };
    const permission = await prisma.permission.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
    });
    ids.set(code, permission.id);
  }
  return ids;
}

async function seedSystemRoles(permissionIds: Map<string, string>): Promise<void> {
  for (const code of Object.values(RoleCode)) {
    // System roles have municipalityId = NULL; PostgreSQL treats NULLs as distinct in
    // the (municipality_id, code) unique index, so upsert cannot target it directly.
    const data = { ...ROLE_NAMES[code], isSystem: true };
    const existing = await prisma.role.findFirst({ where: { municipalityId: null, code } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data })
      : await prisma.role.create({ data: { code, ...data } });

    // Reset the mapping to the catalogue default so the seed converges on re-runs.
    const wanted = DEFAULT_ROLE_PERMISSIONS[code].map((p) => permissionIds.get(p)!);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
}

async function seedMunicipality(): Promise<void> {
  // Fictional demo tenant (docs/DEMO_SCENARIO.md) – the name lives in data, never in code.
  const data = {
    name: 'Şahinbey Belediyesi',
    city: 'Gaziantep',
    primaryColor: '#2563EB',
    secondaryColor: '#0891B2',
    timezone: 'Europe/Istanbul',
    locale: 'tr-TR',
    mapCenterLat: 37.0594,
    mapCenterLng: 37.3825,
    mapZoom: 13,
    settings: { slaAtRiskRatio: 0.25, duplicateRadiusMeters: 150, onSiteRadiusMeters: 150 },
  };
  await prisma.municipality.upsert({
    where: { slug: 'sahinbey' },
    update: {},
    create: { slug: 'sahinbey', ...data },
  });
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const permissionIds = await seedPermissions();
  await seedSystemRoles(permissionIds);
  await seedMunicipality();

  const [permissions, roles, mappings, municipalities] = await Promise.all([
    prisma.permission.count(),
    prisma.role.count({ where: { isSystem: true } }),
    prisma.rolePermission.count(),
    prisma.municipality.count(),
  ]);
  console.log(
    `Seed complete in ${Math.round(performance.now() - startedAt)} ms – ` +
      `${permissions} permissions, ${roles} system roles, ${mappings} role-permission links, ` +
      `${municipalities} municipality`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
