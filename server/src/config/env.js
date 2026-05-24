import dotenv from 'dotenv';
import { z } from 'zod';
import { createBooleanParser } from './envParsers.js';

dotenv.config({ quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const IS_TEST_ENV = process.env.NODE_ENV === 'test';
const TEST_DATABASE_PATTERN = /(test|_test|test_|findly_test)/i;

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

const isSafeTestDatabaseUrl = (value) => TEST_DATABASE_PATTERN.test(String(value || ''));

const applyTestDatabaseUrlOverride = (source = process.env) => {
  if (source.NODE_ENV !== 'test') return source;
  if (source.TEST_DATABASE_URL && source.DATABASE_URL !== source.TEST_DATABASE_URL) {
    source.DATABASE_URL = source.TEST_DATABASE_URL;
  }
  return source;
};

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  TEST_DATABASE_ALLOW_DEV_OVERWRITE: createBooleanParser(false),
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
  AUTH_ABUSE_PROTECTION_ENABLED: createBooleanParser(true),
  AUTH_ABUSE_AUDIT_THROTTLE_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  AUTH_MIN_FORM_DURATION_MS: z.coerce.number().int().min(0).max(60000).default(1200),
  SIGNUP_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  SIGNUP_IP_MAX: z.coerce.number().int().min(1).max(1000).default(IS_TEST_ENV ? 1000 : 5),
  SIGNUP_IP_DAILY_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 5000 : 20),
  SIGNUP_EMAIL_DOMAIN_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  SIGNUP_EMAIL_DOMAIN_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 5000 : 20),
  SIGNUP_EMAIL_HASH_WINDOW_MS: z.coerce.number().int().min(60000).max(7 * 86400000).default(24 * 60 * 60 * 1000),
  SIGNUP_EMAIL_HASH_MAX: z.coerce.number().int().min(1).max(1000).default(IS_TEST_ENV ? 100 : 3),
  DISPOSABLE_EMAIL_BLOCKLIST_ENABLED: createBooleanParser(false),
  DISPOSABLE_EMAIL_DOMAINS: z.string().default(''),
  LOGIN_EMAIL_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  LOGIN_EMAIL_MAX_FAILED: z.coerce.number().int().min(1).max(1000).default(Number(process.env.FAILED_LOGIN_MAX_ATTEMPTS) || (IS_TEST_ENV ? 100 : 5)),
  LOGIN_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  LOGIN_IP_MAX_FAILED: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 20),
  LOGIN_IP_EMAIL_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  LOGIN_IP_EMAIL_MAX_FAILED: z.coerce.number().int().min(1).max(1000).default(Number(process.env.FAILED_LOGIN_MAX_ATTEMPTS) || (IS_TEST_ENV ? 100 : 5)),
  LOGIN_IP_DISTINCT_EMAIL_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  LOGIN_IP_DISTINCT_EMAIL_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 10),
  LOGIN_EMAIL_DISTINCT_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  LOGIN_EMAIL_DISTINCT_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 10),
  LOGIN_DELAY_MAX_MS: z.coerce.number().int().min(0).max(10000).default(1500),
  PASSWORD_RESET_EMAIL_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  PASSWORD_RESET_EMAIL_MAX: z.coerce.number().int().min(1).max(1000).default(IS_TEST_ENV ? 100 : 3),
  PASSWORD_RESET_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  PASSWORD_RESET_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 10),
  PASSWORD_RESET_IP_EMAIL_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  PASSWORD_RESET_IP_EMAIL_MAX: z.coerce.number().int().min(1).max(1000).default(IS_TEST_ENV ? 100 : 3),
  VERIFICATION_RESEND_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  VERIFICATION_RESEND_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 10),
  VERIFICATION_RESEND_USER_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  VERIFICATION_RESEND_USER_MAX: z.coerce.number().int().min(1).max(1000).default(IS_TEST_ENV ? 100 : 3),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(process.env.NODE_ENV === 'development' ? 3000 : 300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(process.env.NODE_ENV === 'development' ? 50 : 20),
  SIGNUP_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(process.env.NODE_ENV === 'development' ? 20 : 8),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(process.env.NODE_ENV === 'development' ? 50 : 8),
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
  TWO_FACTOR_AUTH_ENABLED: createBooleanParser(true),
  TWO_FACTOR_SECRET_ENCRYPTION_KEY: z.string().optional(),
  TWO_FACTOR_ISSUER: z.string().min(1).max(80).default('Findly'),
  TWO_FACTOR_CHALLENGE_COOKIE_NAME: z.string().min(1).default('findly_two_factor_challenge'),
  TWO_FACTOR_LOGIN_CHALLENGE_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
  TWO_FACTOR_CHALLENGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  TWO_FACTOR_SETUP_START_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(10 * 60 * 1000),
  TWO_FACTOR_SETUP_START_MAX: z.coerce.number().int().min(1).max(50).default(5),
  TWO_FACTOR_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  TWO_FACTOR_SETUP_CONFIRM_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(10 * 60 * 1000),
  TWO_FACTOR_SETUP_CONFIRM_MAX: z.coerce.number().int().min(1).max(50).default(5),
  TWO_FACTOR_LOGIN_VERIFY_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  TWO_FACTOR_LOGIN_VERIFY_MAX: z.coerce.number().int().min(1).max(100).default(10),
  TWO_FACTOR_DISABLE_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  TWO_FACTOR_DISABLE_MAX: z.coerce.number().int().min(1).max(50).default(5),
  TWO_FACTOR_BACKUP_REGENERATE_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(15 * 60 * 1000),
  TWO_FACTOR_BACKUP_REGENERATE_MAX: z.coerce.number().int().min(1).max(50).default(5),
  OAUTH_ENABLED: createBooleanParser(false),
  OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().min(1).max(10).default(10),
  OAUTH_ALLOWED_RETURN_PATHS: z.string().min(1).default('/dashboard,/settings,/billing'),
  OAUTH_DEFAULT_SUCCESS_PATH: z.string().min(1).default('/dashboard'),
  OAUTH_FAILURE_PATH: z.string().min(1).default('/auth'),
  OAUTH_START_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(10 * 60 * 1000),
  OAUTH_START_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 30),
  OAUTH_CALLBACK_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(10 * 60 * 1000),
  OAUTH_CALLBACK_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 60),
  OAUTH_SIGNUP_IP_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  OAUTH_SIGNUP_IP_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 1000 : 8),
  OAUTH_SIGNUP_DOMAIN_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(60 * 60 * 1000),
  OAUTH_SIGNUP_DOMAIN_MAX: z.coerce.number().int().min(1).max(10000).default(IS_TEST_ENV ? 5000 : 25),
  BOT_CHALLENGE_ENABLED: createBooleanParser(false),
  BOT_CHALLENGE_PROVIDER: z.enum(['turnstile']).default('turnstile'),
  BOT_CHALLENGE_SIGNUP_MODE: z.enum(['off', 'required', 'risk_based']).default('off'),
  BOT_CHALLENGE_PASSWORD_RESET_MODE: z.enum(['off', 'required', 'risk_based']).default('off'),
  BOT_CHALLENGE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  GOOGLE_OAUTH_ENABLED: createBooleanParser(false),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GITHUB_OAUTH_ENABLED: createBooleanParser(false),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_OAUTH_REDIRECT_URI: z.string().url().optional(),
  DISCORD_OAUTH_ENABLED: createBooleanParser(false),
  DISCORD_OAUTH_CLIENT_ID: z.string().optional(),
  DISCORD_OAUTH_CLIENT_SECRET: z.string().optional(),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: createBooleanParser(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['smtp']).default('smtp'),
  EMAIL_SECURITY_FROM: z.string().optional(),
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
  GEO_ENRICHMENT_ENABLED: createBooleanParser(false),
  GEO_PROVIDER_PRIMARY: z.enum(['geoapify', 'locationiq', 'none']).default('geoapify'),
  GEO_PROVIDER_FALLBACK: z.enum(['geoapify', 'locationiq', 'none']).default('locationiq'),
  GEOAPIFY_API_KEY: z.string().optional(),
  GEOAPIFY_BASE_URL: z.string().url().default('https://api.geoapify.com/v1/geocode/search'),
  GEOAPIFY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
  LOCATIONIQ_API_KEY: z.string().optional(),
  LOCATIONIQ_BASE_URL: z.string().url().default('https://us1.locationiq.com/v1/search'),
  LOCATIONIQ_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
  GEO_CACHE_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  GEO_MIN_CONFIDENCE_TO_MAP: z.coerce.number().int().min(1).max(100).default(70),
  GEO_MIN_CONFIDENCE_TO_SAVE: z.coerce.number().int().min(1).max(100).default(55),
  GEO_MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
  GEO_ENRICHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  GEO_ENRICHMENT_ITEM_DELAY_MS: z.coerce.number().int().min(0).max(10000).default(250),
  GEO_PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  GEO_PROVIDER_FAIL_OPEN: createBooleanParser(true),
  OPEN_WEB_EVIDENCE_ENABLED: createBooleanParser(true),
  OPEN_WEB_EVIDENCE_PROVIDER: z.enum(['common_crawl']).default('common_crawl'),
  OPEN_WEB_EVIDENCE_FAIL_OPEN: createBooleanParser(true),
  OPEN_WEB_EVIDENCE_CACHE_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN: z.coerce.number().int().min(1).max(20).default(5),
  OPEN_WEB_EVIDENCE_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(6000),
  OPEN_WEB_EVIDENCE_USER_AGENT: z.string().min(8).max(200).default('FindlyOpenWebEvidence/0.1'),
  OPEN_WEB_EVIDENCE_MIN_CONFIDENCE_TO_SKIP_PAID: z.coerce.number().int().min(0).max(100).default(70),
  OPEN_WEB_EVIDENCE_MAX_URLS_PER_SEARCH: z.coerce.number().int().min(1).max(50).default(10),
  OPEN_WEB_EVIDENCE_ENABLE_SEARCH_ASSIST: createBooleanParser(true),
  OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS: createBooleanParser(true),
  OPEN_WEB_EVIDENCE_ENABLE_DOMAIN_ENRICHMENT: createBooleanParser(true),
  COMMON_CRAWL_ENABLED: createBooleanParser(true),
  COMMON_CRAWL_INDEX_ID: z.string().min(1).default('latest'),
  COMMON_CRAWL_INDEX_BASE_URL: z.string().url().default('https://index.commoncrawl.org'),
  COMMON_CRAWL_DATA_BASE_URL: z.string().url().default('https://data.commoncrawl.org'),
  COMMON_CRAWL_MAX_INDEX_RESULTS: z.coerce.number().int().min(1).max(20).default(10),
  COMMON_CRAWL_FETCH_WAT_ENABLED: createBooleanParser(false),
  COMMON_CRAWL_FETCH_WARC_ENABLED: createBooleanParser(true),
  COMMON_CRAWL_MAX_WARC_BYTES: z.coerce.number().int().min(32_768).max(1_048_576).default(262144),
  COMMON_CRAWL_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(6000),
  WEBSITE_ENRICHMENT_JOB_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(25),
  WEBSITE_ENRICHMENT_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(1),
  WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS: z.coerce.number().int().min(0).max(10000).default(250),
  WEBSITE_ENRICHMENT_JOB_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(10 * 60 * 1000),
  WEBSITE_ENRICHMENT_JOB_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(3),
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
  if (value.NODE_ENV === 'test') {
    const candidateDatabaseUrl = value.TEST_DATABASE_URL || value.DATABASE_URL;
    if (!candidateDatabaseUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'TEST_DATABASE_URL or a test-only DATABASE_URL is required in test mode.',
      });
    } else if (!value.TEST_DATABASE_ALLOW_DEV_OVERWRITE && !isSafeTestDatabaseUrl(candidateDatabaseUrl)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Refusing to run tests against a non-test database. Set TEST_DATABASE_URL or use TEST_DATABASE_ALLOW_DEV_OVERWRITE=true explicitly.',
      });
    }
  }

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

  const oauthProviders = [
    ['GOOGLE_OAUTH', value.GOOGLE_OAUTH_ENABLED, value.GOOGLE_OAUTH_CLIENT_ID, value.GOOGLE_OAUTH_CLIENT_SECRET, value.GOOGLE_OAUTH_REDIRECT_URI],
    ['GITHUB_OAUTH', value.GITHUB_OAUTH_ENABLED, value.GITHUB_OAUTH_CLIENT_ID, value.GITHUB_OAUTH_CLIENT_SECRET, value.GITHUB_OAUTH_REDIRECT_URI],
    ['DISCORD_OAUTH', value.DISCORD_OAUTH_ENABLED, value.DISCORD_OAUTH_CLIENT_ID, value.DISCORD_OAUTH_CLIENT_SECRET, value.DISCORD_OAUTH_REDIRECT_URI],
  ];
  for (const [prefix, enabled, clientId, clientSecret, redirectUri] of oauthProviders) {
    if (!enabled) continue;
    if (!value.OAUTH_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['OAUTH_ENABLED'],
        message: 'OAUTH_ENABLED must be true when an OAuth provider is enabled.',
      });
    }
    if (!clientId) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}_CLIENT_ID`], message: `${prefix}_CLIENT_ID is required when enabled.` });
    }
    if (!clientSecret) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}_CLIENT_SECRET`], message: `${prefix}_CLIENT_SECRET is required when enabled.` });
    }
    if (!redirectUri) {
      ctx.addIssue({ code: 'custom', path: [`${prefix}_REDIRECT_URI`], message: `${prefix}_REDIRECT_URI is required when enabled.` });
    } else if (isLocalhostUrl(redirectUri)) {
      ctx.addIssue({
        code: 'custom',
        path: [`${prefix}_REDIRECT_URI`],
        message: `${prefix}_REDIRECT_URI cannot point to localhost in production.`,
      });
    }
  }

  if (value.BOT_CHALLENGE_ENABLED && !value.TURNSTILE_SECRET_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['TURNSTILE_SECRET_KEY'],
      message: 'TURNSTILE_SECRET_KEY is required when bot challenge protection is enabled.',
    });
  }

  if (value.BOT_CHALLENGE_ENABLED && !value.TURNSTILE_SITE_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['TURNSTILE_SITE_KEY'],
      message: 'TURNSTILE_SITE_KEY is required when bot challenge protection is enabled.',
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

  if (value.GEO_ENRICHMENT_ENABLED) {
    const usesGeoapify = value.GEO_PROVIDER_PRIMARY === 'geoapify' || value.GEO_PROVIDER_FALLBACK === 'geoapify';
    const usesLocationIq = value.GEO_PROVIDER_PRIMARY === 'locationiq' || value.GEO_PROVIDER_FALLBACK === 'locationiq';

    if (usesGeoapify && !value.GEOAPIFY_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEOAPIFY_API_KEY'],
        message: 'GEOAPIFY_API_KEY is required when Geoapify geocoding is enabled in production.',
      });
    }

    if (usesLocationIq && !value.LOCATIONIQ_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOCATIONIQ_API_KEY'],
        message: 'LOCATIONIQ_API_KEY is required when LocationIQ geocoding is enabled in production.',
      });
    }
  }

  if (value.NODE_ENV === 'production' && value.TWO_FACTOR_AUTH_ENABLED && !value.TWO_FACTOR_SECRET_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['TWO_FACTOR_SECRET_ENCRYPTION_KEY'],
      message: 'TWO_FACTOR_SECRET_ENCRYPTION_KEY is required when two-factor authentication is enabled.',
    });
  }

  if (
    value.NODE_ENV === 'production'
    && value.TWO_FACTOR_AUTH_ENABLED
    && value.TWO_FACTOR_SECRET_ENCRYPTION_KEY
    && !isStrongMasterKey(value.TWO_FACTOR_SECRET_ENCRYPTION_KEY)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['TWO_FACTOR_SECRET_ENCRYPTION_KEY'],
      message: 'TWO_FACTOR_SECRET_ENCRYPTION_KEY must decode to at least 32 bytes.',
    });
  }

  if (
    value.TWO_FACTOR_AUTH_ENABLED
    && value.TWO_FACTOR_SECRET_ENCRYPTION_KEY
    && !isStrongMasterKey(value.TWO_FACTOR_SECRET_ENCRYPTION_KEY)
  ) {
    console.warn('[WARNING] TWO_FACTOR_SECRET_ENCRYPTION_KEY does not decode to at least 32 bytes. Two-factor setup will be unavailable until this is fixed.');
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
  const preparedSource = applyTestDatabaseUrlOverride(source);
  const parsed = envSchema.safeParse(preparedSource);

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
    OAUTH_ALLOWED_RETURN_PATHS_LIST: parseOriginList(parsed.data.OAUTH_ALLOWED_RETURN_PATHS),
    DISPOSABLE_EMAIL_DOMAINS_LIST: parseOriginList(parsed.data.DISPOSABLE_EMAIL_DOMAINS).map((domain) => domain.toLowerCase()),
  };
};

export const env = parseEnv(process.env);

export { applyTestDatabaseUrlOverride, isSafeTestDatabaseUrl };
