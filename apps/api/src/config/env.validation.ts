import { z } from 'zod';
import { DURATION_PATTERN, parseDurationSeconds } from '../common/utils/duration';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const duration = z.string().regex(DURATION_PATTERN, 'must look like 900s, 15m, 12h or 7d');

/**
 * Environment contract. The process refuses to start with an invalid configuration
 * instead of failing later at the first request that needs the missing value.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SWAGGER_ENABLED: booleanString.optional(),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  MINIO_ENDPOINT: z.string().url().default('http://localhost:9000'),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_ACCESS_KEY: z.string().min(1).default('kent360'),
  MINIO_SECRET_KEY: z.string().min(1).default('kent360_dev_secret'),
  MINIO_BUCKET: z.string().min(3).default('kent360-media'),
  /** Host browsers use for presigned URLs when it differs from MINIO_ENDPOINT (e.g. behind a proxy). */
  MINIO_PUBLIC_ENDPOINT: z.string().url().optional(),
  /** Lifetime of presigned media URLs, in seconds (1–3600). */
  MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  /** Durations such as 900s, 15m, 12h, 7d – exposed to the app as seconds. */
  JWT_ACCESS_TTL: duration.default('15m').transform(parseDurationSeconds),
  JWT_REFRESH_TTL: duration.default('7d').transform(parseDurationSeconds),
  /** Secure flag of the refresh cookie; defaults to true in production. */
  AUTH_COOKIE_SECURE: booleanString.optional(),

  /**
   * Development/demo only: accept field steps (ON_SITE, IN_PROGRESS) without a device
   * position and without the distance check. Refused in production (see below).
   */
  FIELD_LOCATION_BYPASS: booleanString.default(false),

  AI_PROVIDER: z.enum(['mock']).default('mock'),
  AI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('change-me')) {
    throw new Error('Refusing to start in production with the example JWT secret.');
  }
  if (env.NODE_ENV === 'production' && env.FIELD_LOCATION_BYPASS) {
    throw new Error('FIELD_LOCATION_BYPASS must not be enabled in production.');
  }
  return env;
}
