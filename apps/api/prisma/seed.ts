/**
 * KENT360 development seed – idempotent, safe to run repeatedly (`npm run db:seed`).
 *
 * Seeds the RBAC catalogue (from @kent360/shared-types), the demo municipality and
 * the demo accounts (password: Kent360!Demo), departments, the request category tree and
 * DEMO neighbourhood geometries (not official boundaries – see prisma/seed-domain.ts).
 * 120 deterministic DEMO requests (Phase 5, created once), 5 field teams with demo field
 * staff and 45 DEMO work orders with drawn before/after photos (Phase 6, created once),
 * 9 recent MahallePulse / AI demo requests with stored analyses (Phase 10–11, once).
 *
 * Never run against a production database: it refuses NODE_ENV=production.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/domain/password-policy';
import { seedDemoMunicipality, seedDemoUsers, seedRbac } from './seed-data';
import { seedMunicipalityDomain } from './seed-domain';
import { seedDemoRequests } from './seed-requests';
import { seedPulseSignals } from './seed-pulse';
import { type PutObject, seedDemoWorkOrders } from './seed-work-orders';

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

/** Demo photos go to the configured (private) media bucket, like real uploads. */
function objectStorage(): PutObject {
  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.MINIO_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'kent360',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'kent360_dev_secret',
    },
  });
  const bucket = process.env.MINIO_BUCKET ?? 'kent360-media';
  let ready: Promise<unknown> | undefined;
  return async (key, body, contentType) => {
    ready ??= s3.send(new CreateBucketCommand({ Bucket: bucket })).catch((error: Error) => {
      if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') {
        throw new Error(`Demo photos need MinIO (npm run infra:up): ${error.message}`);
      }
    });
    await ready;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: 'inline',
      }),
    );
  };
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const roleIds = await seedRbac(prisma);
  const municipalityId = await seedDemoMunicipality(prisma);
  const newUsers = await seedDemoUsers(prisma, municipalityId, roleIds, hashPassword);
  const domain = await seedMunicipalityDomain(prisma, municipalityId);
  const requests = await seedDemoRequests(prisma, municipalityId);
  const field = await seedDemoWorkOrders(prisma, municipalityId, hashPassword, objectStorage());
  const signals = await seedPulseSignals(prisma, municipalityId);

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
      `${municipalities} municipality, ${users} users (${newUsers} new); new domain records: ` +
      `${domain.departments} departments, ${domain.categories} categories, ` +
      `${domain.neighborhoods} neighbourhoods, ${requests} demo requests, ${field.teams} field teams, ` +
      `${field.users} field staff, ${field.workOrders} demo work orders, ` +
      `${signals} MahallePulse/AI demo requests`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
