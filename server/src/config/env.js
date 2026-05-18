import dotenv from 'dotenv';
import { z } from 'zod';
import { createBooleanParser } from './envParsers.js';

dotenv.config({ quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const parseOriginList = (value = '') => String(value)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isLocalhostUrl = (value) => {
  try {
    const parsed = new URL(value);
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const isStrongMasterKey = (value) => {
  if (!value) return false;
  try {
    return Buffer.from(value, 'base64').length >= 32;
  } catch {
    return false;
  }
};

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters')
    .refine((value) => !value.includes('replace-with'), 'SESSION_SECRET must not use the example placeholder.'),
  COOKIE_NAME: z.string().min(1).default('findly_session'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: createBooleanParser(undefined),
  CSRF_COOKIE_NAME: z.string().min(1).default('findly_csrf'),
  CSRF_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  CSRF_COOKIE_DOMAIN: z.string().optional(),
  CSRF_COOKIE_SECURE: createBooleanParser(undefined),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SESSION_SHORT_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(2),
  FAILED_LOGIN_ATTEMPT_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  FAILED_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  SIGNUP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(8),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(8),
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(15).max(120).default(45),
  SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  ANALYSIS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  SEARCH_RUN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).optional(),
  ANALYSIS_RUN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).optional(),
  JSON_BODY_LIMIT: z.string().min(1).default('100kb'),
  URLENCODED_BODY_LIMIT: z.string().min(1).default('50kb'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(50).default(10),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  APP_URL: z.string().url().default('http://localhost:4000'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: createBooleanParser(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  YELP_API_KEY: z.string().optional(),
  SEARCH_METADATA_PROVIDER_PRIMARY: z.string().min(1).default('serper'),
  SEARCH_METADATA_PROVIDER_FALLBACK: z.string().min(1).default('serpapi'),
  LIVE_SEARCH_METADATA_DISCOVERY_ENABLED: createBooleanParser(false),
  SEARCH_METADATA_MAX_QUERIES_PER_CAMPAIGN: z.coerce.number().int().min(1).max(20).default(5),
  SEARCH_METADATA_MAX_QUERY_LENGTH: z.coerce.number().int().min(40).max(500).default(180),
  SEARCH_METADATA_MIN_PROVIDER_RESULTS: z.coerce.number().int().min(1).max(20).default(3),
  SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE: z.coerce.number().int().min(0).max(100).default(55),
  SERPER_API_KEY: z.string().optional(),
  SERPER_BASE_URL: z.string().url().default('https://google.serper.dev/search'),
  SERPER_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  SERPAPI_API_KEY: z.string().optional(),
  LIVE_SERP_DISCOVERY_ENABLED: createBooleanParser(false),
  SERPAPI_BASE_URL: z.string().url().default('https://serpapi.com/search.json'),
  SERPAPI_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  SERPAPI_MAX_QUERIES_PER_CAMPAIGN: z.coerce.number().int().min(1).max(20).default(5),
  DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED: createBooleanParser(false),
  DISCOVERY_SECRETS_MASTER_KEY: z.string().optional(),
  AI_ENABLED: createBooleanParser(false),
  AI_STRICT_SECURITY_MODE: createBooleanParser(true),
  AI_STORE_RAW_PAYLOADS: createBooleanParser(false),
  AI_LOG_PROMPTS: createBooleanParser(false),
  AI_LOG_RESPONSES: createBooleanParser(false),
  AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION: createBooleanParser(false),
  AI_SECRETS_MASTER_KEY: z.string().optional(),
  AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED: createBooleanParser(false),
  AI_DEFAULT_PROVIDER: z.string().optional(),
  AI_DEFAULT_MODEL: z.string().optional(),
  AI_DEFAULT_TASK_PROVIDER: z.string().default('gemini'),
  AI_DEFAULT_TASK_MODEL: z.string().default('gemini-2.5-flash'),
  AI_ANALYSIS_ENABLED: createBooleanParser(false),
  AI_ANALYSIS_PROVIDER_CHAIN: z.string().default('gemini,openai,anthropic,deepseek,kimi,qwen,rule_based'),
  AI_ANALYSIS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  AI_ANALYSIS_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  AI_ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
  OPENAI_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
  ANTHROPIC_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_DEFAULT_MODEL: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_DEFAULT_MODEL: z.string().optional(),
  DEEPSEEK_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  KIMI_API_KEY: z.string().optional(),
  KIMI_DEFAULT_MODEL: z.string().optional(),
  KIMI_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  QWEN_API_KEY: z.string().optional(),
  QWEN_DEFAULT_MODEL: z.string().optional(),
  QWEN_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
  REDDIT_REFRESH_TOKEN: z.string().optional(),
  REDDIT_ACCESS_TOKEN_URL: z.string().url().default('https://www.reddit.com/api/v1/access_token'),
  REDDIT_API_BASE_URL: z.string().url().default('https://oauth.reddit.com'),
  REDDIT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  REDDIT_MAX_RESULTS_DEFAULT: z.coerce.number().int().min(1).max(100).default(25),
  REDDIT_MAX_RESULTS_HARD_LIMIT: z.coerce.number().int().min(1).max(100).default(50),
  DATASET_IMPORT_DIR: z.string().optional(),
  DATASET_IMPORT_MODE: z.enum(['global']).default('global'),
  IMPORT_AS_ADMIN: createBooleanParser(true),
  IMPORT_USER_EMAIL: z.string().email().optional(),
  IMPORT_WORKSPACE_ID: z.string().optional(),
  WEBSITE_FETCH_TIMEOUT_MS: z.coerce.number().int().min(500).max(20000).default(5000),
  WEBSITE_FETCH_MAX_BYTES: z.coerce.number().int().min(10_000).max(2_000_000).default(512_000),
  WEBSITE_FETCH_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
  WEBSITE_ENRICHMENT_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SOURCE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(10000),
  SOURCE_MAX_RESULTS_DEFAULT: z.coerce.number().int().min(1).max(100).default(20),
  SOURCE_MAX_RESULTS_HARD_LIMIT: z.coerce.number().int().min(1).max(200).default(100),
  JOB_STALE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  ENABLE_WORKER: createBooleanParser(false),
  QUEUE_DRIVER: z.enum(['postgres', 'redis']).default('postgres'),
  REDIS_URL: z.string().optional(),
  MAX_SEARCH_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  SEARCH_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(50).optional(),
  SEARCH_QUEUE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).optional(),
  SEARCH_QUEUE_RATE_LIMIT_DURATION_MS: z.coerce.number().int().min(1000).optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60000).default(1000),
  WORKER_ID: z.string().optional(),
  MAX_QUEUED_SEARCH_JOBS: z.coerce.number().int().min(1).max(10000).default(100),
  MAX_RUNNING_SEARCH_JOBS: z.coerce.number().int().min(1).max(1000).default(10),
  MAX_ACTIVE_SEARCH_JOBS_PER_USER: z.coerce.number().int().min(1).max(100).default(2),
  LOCAL_DATASET_CANDIDATE_LIMIT: z.coerce.number().int().min(100).max(10000).default(1000),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86400).default(300),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  IMPORT_UPLOAD_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  ADMIN_UPLOAD_DIR: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;

  const clientOrigins = parseOriginList(value.CLIENT_ORIGIN);
  if (clientOrigins.includes('*')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLIENT_ORIGIN'],
      message: 'CLIENT_ORIGIN must be explicit in production and cannot use wildcard origins.',
    });
  }

  for (const origin of clientOrigins) {
    if (isLocalhostUrl(origin)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLIENT_ORIGIN'],
        message: 'CLIENT_ORIGIN cannot point to localhost in production.',
      });
      break;
    }
  }

  if (isLocalhostUrl(value.CLIENT_URL)) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLIENT_URL'],
      message: 'CLIENT_URL cannot point to localhost in production.',
    });
  }

  if (isLocalhostUrl(value.APP_URL)) {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_URL'],
      message: 'APP_URL cannot point to localhost in production.',
    });
  }

  const requiredSmtpFields = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
  for (const field of requiredSmtpFields) {
    if (!value[field]) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required in production.`,
      });
    }
  }

  if (value.COOKIE_SECURE === false) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE cannot be false in production.',
    });
  }

  if (value.CSRF_COOKIE_SECURE === false) {
    ctx.addIssue({
      code: 'custom',
      path: ['CSRF_COOKIE_SECURE'],
      message: 'CSRF_COOKIE_SECURE cannot be false in production.',
    });
  }

  if (value.COOKIE_SAME_SITE === 'none' && value.COOKIE_SECURE === false) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none in production.',
    });
  }

  if (value.CSRF_COOKIE_SAME_SITE === 'none' && value.CSRF_COOKIE_SECURE === false) {
    ctx.addIssue({
      code: 'custom',
      path: ['CSRF_COOKIE_SECURE'],
      message: 'CSRF_COOKIE_SECURE must be true when CSRF_COOKIE_SAME_SITE is none in production.',
    });
  }

  if (value.COOKIE_DOMAIN) {
    // Only warn if they set it but we can't fully validate domains here.
    if (value.COOKIE_SAME_SITE === 'none' && !value.COOKIE_DOMAIN.startsWith('.')) {
      console.warn(`[WARNING] COOKIE_DOMAIN "${value.COOKIE_DOMAIN}" is set with SameSite=None. Ensure it matches the frontend domain or use no domain for completely separate hosting.`);
    }
  }

  if (value.NODE_ENV === 'production' && value.AI_LOG_PROMPTS && !value.AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_LOG_PROMPTS'],
      message: 'AI_LOG_PROMPTS cannot be true in production unless AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION is true.',
    });
  }

  if (value.NODE_ENV === 'production' && value.AI_LOG_RESPONSES && !value.AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_LOG_RESPONSES'],
      message: 'AI_LOG_RESPONSES cannot be true in production unless AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION is true.',
    });
  }

  if (value.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED && !value.AI_SECRETS_MASTER_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_SECRETS_MASTER_KEY'],
      message: 'AI_SECRETS_MASTER_KEY is required when AI dashboard secret management is enabled.',
    });
  }

  if (value.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED && !isStrongMasterKey(value.AI_SECRETS_MASTER_KEY)) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_SECRETS_MASTER_KEY'],
      message: 'AI_SECRETS_MASTER_KEY must decode to at least 32 bytes when dashboard secret management is enabled.',
    });
  }

  if (value.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED) {
    const discoveryMasterKey = value.DISCOVERY_SECRETS_MASTER_KEY || value.AI_SECRETS_MASTER_KEY;
    if (!discoveryMasterKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCOVERY_SECRETS_MASTER_KEY'],
        message: 'DISCOVERY_SECRETS_MASTER_KEY or AI_SECRETS_MASTER_KEY is required when discovery dashboard secret management is enabled.',
      });
    } else if (!isStrongMasterKey(discoveryMasterKey)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCOVERY_SECRETS_MASTER_KEY'],
        message: 'Discovery secrets master key must decode to at least 32 bytes when dashboard secret management is enabled.',
      });
    }
  }

  const hasAiProviderKey = Boolean(
    value.GEMINI_API_KEY
      || value.OPENAI_API_KEY
      || value.ANTHROPIC_API_KEY
      || value.DEEPSEEK_API_KEY
      || value.KIMI_API_KEY
      || value.QWEN_API_KEY,
  );
  const hasDashboardSecretVault = Boolean(value.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED && value.AI_SECRETS_MASTER_KEY);
  const analysisChain = (value.AI_ANALYSIS_PROVIDER_CHAIN || '').split(',').map((item) => item.trim().toLowerCase());
  if (value.NODE_ENV === 'production' && value.AI_ENABLED && !hasAiProviderKey && !hasDashboardSecretVault) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_ENABLED'],
      message: 'AI_ENABLED cannot be true in production without at least one configured AI provider key.',
    });
  }
  if (
    value.NODE_ENV === 'production'
    && value.AI_ANALYSIS_ENABLED
    && !hasAiProviderKey
    && !hasDashboardSecretVault
    && !analysisChain.includes('rule_based')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_ANALYSIS_PROVIDER_CHAIN'],
      message: 'AI analysis requires a configured provider or rule_based fallback in production.',
    });
  }
});

export const parseEnv = (source = process.env) => {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid server environment: ${issues}`);
  }

  return {
    ...parsed.data,
    SEARCH_RATE_LIMIT_MAX: parsed.data.SEARCH_RUN_RATE_LIMIT_MAX ?? parsed.data.SEARCH_RATE_LIMIT_MAX,
    ANALYSIS_RATE_LIMIT_MAX: parsed.data.ANALYSIS_RUN_RATE_LIMIT_MAX ?? parsed.data.ANALYSIS_RATE_LIMIT_MAX,
    SEARCH_QUEUE_CONCURRENCY: parsed.data.SEARCH_QUEUE_CONCURRENCY ?? parsed.data.MAX_SEARCH_WORKER_CONCURRENCY,
    IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
    CLIENT_ORIGINS: parseOriginList(parsed.data.CLIENT_ORIGIN),
  };
};

export const env = parseEnv(process.env);
