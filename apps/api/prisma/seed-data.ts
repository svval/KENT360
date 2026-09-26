/**
 * Seed building blocks, shared by the development seed (prisma/seed.ts) and the e2e
 * test fixtures. Every function is idempotent.
 */
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
  RoleCode,
} from '@kent360/shared-types';
import { type PrismaClient } from '../src/generated/prisma/client';

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
  'municipality.read': 'Belediye profilini görüntüleme',
  'municipality.update': 'Belediye profilini güncelleme',
  'departments.read': 'Müdürlükleri görüntüleme',
  'departments.manage': 'Müdürlükleri yönetme',
  'categories.read': 'Kategorileri görüntüleme',
  'categories.manage': 'Kategorileri yönetme',
  'neighborhoods.read': 'Mahalleleri görüntüleme',
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

/** Permission catalogue + system roles + default role→permission mappings. Returns role ids by code. */
export async function seedRbac(prisma: PrismaClient): Promise<Map<RoleCode, string>> {
  const permissionIds = new Map<string, string>();
  for (const code of ALL_PERMISSIONS) {
    const data = { name: PERMISSION_NAMES[code], group: code.split('.')[0] };
    const permission = await prisma.permission.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
    });
    permissionIds.set(code, permission.id);
  }

  const roleIds = new Map<RoleCode, string>();
  for (const code of Object.values(RoleCode)) {
    // The DB guarantees one row per system role (NULLS NOT DISTINCT index), but Prisma
    // cannot put NULL into a compound-unique `where`, so upsert is done by hand.
    const data = { ...ROLE_NAMES[code], isSystem: true };
    const existing = await prisma.role.findFirst({ where: { municipalityId: null, code } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data })
      : await prisma.role.create({ data: { code, ...data } });
    roleIds.set(code, role.id);

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
  return roleIds;
}

/** Fictional demo tenant (docs/DEMO_SCENARIO.md) – the name lives in data, never in code. */
export async function seedDemoMunicipality(prisma: PrismaClient): Promise<string> {
  const municipality = await prisma.municipality.upsert({
    where: { slug: 'sahinbey' },
    update: {},
    create: {
      slug: 'sahinbey',
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
    },
  });
  return municipality.id;
}

/** DEVELOPMENT ONLY – documented in README and docs/DEMO_SCENARIO.md. */
export const DEMO_PASSWORD = 'Kent360!Demo';

export const DEMO_USERS: readonly {
  email: string;
  firstName: string;
  lastName: string;
  role: RoleCode;
}[] = [
  {
    email: 'admin@kent360.local',
    firstName: 'Sistem',
    lastName: 'Yöneticisi',
    role: RoleCode.SYSTEM_ADMIN,
  },
  {
    email: 'manager@kent360.local',
    firstName: 'Elif',
    lastName: 'Demir',
    role: RoleCode.DEPARTMENT_MANAGER,
  },
  {
    email: 'leader@kent360.local',
    firstName: 'Murat',
    lastName: 'Şahin',
    role: RoleCode.TEAM_LEADER,
  },
  {
    email: 'field@kent360.local',
    firstName: 'Ahmet',
    lastName: 'Kaya',
    role: RoleCode.FIELD_STAFF,
  },
  {
    email: 'citizen@kent360.local',
    firstName: 'Zeynep',
    lastName: 'Arslan',
    role: RoleCode.CITIZEN,
  },
];

/**
 * Demo accounts with a publicly known password. Refuses to run in production even if
 * called directly (defence in depth next to the guard in prisma/seed.ts). Existing
 * accounts are left as they are – only missing users and role grants are added.
 */
export async function seedDemoUsers(
  prisma: PrismaClient,
  municipalityId: string,
  roleIds: Map<RoleCode, string>,
  hashPassword: (password: string) => Promise<string>,
): Promise<number> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo users must never be created with NODE_ENV=production.');
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let created = 0;
  for (const demo of DEMO_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: demo.email },
      select: { id: true },
    });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          municipalityId,
          email: demo.email,
          firstName: demo.firstName,
          lastName: demo.lastName,
          passwordHash,
        },
        select: { id: true },
      }));
    if (!existing) created += 1;
    await prisma.userRole.createMany({
      data: [{ userId: user.id, roleId: roleIds.get(demo.role)! }],
      skipDuplicates: true,
    });
  }
  return created;
}
