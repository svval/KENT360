/**
 * KENT360 development seed – idempotent, safe to run repeatedly (`npm run db:seed`).
 *
 * Seeds the RBAC catalogue (from @kent360/shared-types), the demo municipality and
 * the demo accounts (password: Kent360!Demo). Departments, neighbourhoods,
 * categories, requests and work orders are added in Phase 4–6.
 *
 * Never run against a production database: it refuses NODE_ENV=production.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/domain/password-policy';
import { seedDemoMunicipality, seedDemoUsers, seedRbac } from './seed-data';

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

async function main(): Promise<void> {
  const startedAt = performance.now();
  const roleIds = await seedRbac(prisma);
  const municipalityId = await seedDemoMunicipality(prisma);
  const newUsers = await seedDemoUsers(prisma, municipalityId, roleIds, hashPassword);

  const [permissions, roles, mappings, municipalities, users] = await Promise.all([
    prisma.permission.count(),
    prisma.role.count({ where: { isSystem: true } }),
    prisma.rolePermission.count(),
    prisma.municipality.count(),
    prisma.user.count(),
  ]);
  console.log(
    `Seed complete in ${Math.round(performance.now() - startedAt)} ms – ` +
      `${permissions} permissions, ${roles} system roles, ${mappings} role-permission links, ` +
      `${municipalities} municipality, ${users} users (${newUsers} new)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
