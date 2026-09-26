import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { testDatabaseUrl } from './test-database';

/**
 * Creates kent360_test if needed and applies pending migrations (non-destructive).
 * Nothing is deleted between runs: fixtures use unique slugs/e-mails per run, and
 * audit_logs is append-only anyway. To start from scratch, drop the kent360_test
 * database by hand.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `e2e tests need PostgreSQL (npm run infra:up). Could not connect: ${(error as Error).message}`,
    );
  }
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    // Identifier comes from our own config and is validated to end in _test.
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}
