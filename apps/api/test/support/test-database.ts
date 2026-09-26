import path from 'node:path';
import { config as loadEnv } from 'dotenv';

export const TEST_DATABASE_NAME = 'kent360_test';

/**
 * e2e tests never touch the development database: audit_logs is append-only, so data
 * written by tests could not be cleaned up there. They use `kent360_test` on the same
 * server, rebuilt from the migrations at the start of every run.
 */
export function testDatabaseUrl(): string {
  loadEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  const base = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set – copy .env.example to .env');

  const url = new URL(base);
  if (!process.env.E2E_DATABASE_URL) url.pathname = `/${TEST_DATABASE_NAME}`;
  if (!url.pathname.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against a non-test database (${url.pathname})`);
  }
  return url.toString();
}
