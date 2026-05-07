import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters')
    .refine((value) => !value.includes('replace-with'), 'SESSION_SECRET must not use the example placeholder.'),
  COOKIE_NAME: z.string().min(1).default('findly_session'),
  CSRF_COOKIE_NAME: z.string().min(1).default('findly_csrf'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  SIGNUP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(8),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(8),
  JSON_BODY_LIMIT: z.string().min(1).default('100kb'),
  URLENCODED_BODY_LIMIT: z.string().min(1).default('50kb'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(50).default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid server environment: ${issues}`);
}

export const env = {
  ...parsed.data,
  IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
  CLIENT_ORIGINS: parsed.data.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
