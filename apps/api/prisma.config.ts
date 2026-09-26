import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The monorepo keeps a single .env at the repository root.
loadEnv({ path: path.resolve(__dirname, '../../.env'), quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Placeholder keeps `prisma generate` / `validate` usable before a .env exists.
    url:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
