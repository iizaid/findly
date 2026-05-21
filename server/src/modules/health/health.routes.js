import { Router } from 'express';
import { errorResponse, successResponse } from '../../utils/apiResponse.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { errorCodes } from '../../utils/AppError.js';

export const healthRouter = Router();
export const readyRouter = Router();

const elapsedMs = (startedAtMs) => Math.max(0, Date.now() - startedAtMs);
const hasValue = (value) => String(value || '').trim().length > 0;
const safeBoolean = (value) => Boolean(value);

const configuredCount = (providers = []) => providers.filter((provider) => provider.configured).length;
const enabledCount = (providers = []) => providers.filter((provider) => provider.enabled).length;

const statusFor = ({ enabled = true, configured = true, required = false } = {}) => {
  if (!enabled) return 'disabled';
  if (configured) return 'ok';
  return required ? 'missing_required_config' : 'not_configured';
};

const buildSafeProviderSummary = (providers = []) => ({
  enabledCount: enabledCount(providers),
  configuredCount: configuredCount(providers),
  providers: providers.map((provider) => ({
    name: provider.name,
    enabled: Boolean(provider.enabled),
    configured: Boolean(provider.configured),
    status: statusFor({
      enabled: provider.enabled,
      configured: provider.configured,
      required: provider.required,
    }),
  })),
});

const buildProductionWarnings = ({ categories }) => {
  const warnings = [];

  if (env.NODE_ENV !== 'production') {
    warnings.push({
      code: 'NON_PRODUCTION_ENVIRONMENT',
      severity: 'INFO',
      message: 'Server is not running with NODE_ENV=production.',
    });
  }

  if (!categories.email.configured) {
    warnings.push({
      code: 'SMTP_NOT_CONFIGURED',
      severity: env.NODE_ENV === 'production' ? 'ERROR' : 'WARNING',
      message: 'SMTP is not fully configured; email verification and password reset cannot be production-verified.',
    });
  }

  if (categories.uploads.status === 'local_disk_warning') {
    warnings.push({
      code: 'UPLOAD_STORAGE_LOCAL_OR_UNSET',
      severity: 'WARNING',
      message: 'Admin upload storage is local/unset; confirm persistence before production imports.',
    });
  }

  if (categories.openWebEvidence.warcFetchEnabled) {
    warnings.push({
      code: 'COMMON_CRAWL_WARC_FETCH_ENABLED',
      severity: 'INFO',
      message: 'Bounded WARC fetch is enabled. Monitor latency and disable if production search/jobs slow down.',
    });
  }

  if (!categories.workers.enabled) {
    warnings.push({
      code: 'BACKGROUND_WORKER_DISABLED',
      severity: 'INFO',
      message: 'Background worker is disabled; inline processing is acceptable for controlled private beta but should be reviewed before scale.',
    });
  }

  if (categories.ai.enabled && categories.ai.configuredProvidersCount === 0 && !categories.ai.dashboardSecretManagementEnabled) {
    warnings.push({
      code: 'AI_ENABLED_WITHOUT_PROVIDER',
      severity: 'WARNING',
      message: 'AI is enabled but no direct AI provider key is configured and dashboard-managed keys are disabled.',
    });
  }

  if (categories.liveDiscovery.enabled && categories.liveDiscovery.configuredProvidersCount === 0 && !categories.liveDiscovery.dashboardSecretManagementEnabled) {
    warnings.push({
      code: 'LIVE_DISCOVERY_ENABLED_WITHOUT_PROVIDER',
      severity: 'WARNING',
      message: 'Live discovery is enabled but no direct discovery provider key is configured and dashboard-managed keys are disabled.',
    });
  }

  return warnings;
};

const buildConfigurationSummary = () => {
  const oauthProviders = [
    {
      name: 'google',
      enabled: env.GOOGLE_OAUTH_ENABLED,
      configured: hasValue(env.GOOGLE_OAUTH_CLIENT_ID) && hasValue(env.GOOGLE_OAUTH_CLIENT_SECRET) && hasValue(env.GOOGLE_OAUTH_REDIRECT_URI),
      required: env.GOOGLE_OAUTH_ENABLED,
    },
    {
      name: 'github',
      enabled: env.GITHUB_OAUTH_ENABLED,
      configured: hasValue(env.GITHUB_OAUTH_CLIENT_ID) && hasValue(env.GITHUB_OAUTH_CLIENT_SECRET) && hasValue(env.GITHUB_OAUTH_REDIRECT_URI),
      required: env.GITHUB_OAUTH_ENABLED,
    },
    {
      name: 'discord',
      enabled: env.DISCORD_OAUTH_ENABLED,
      configured: hasValue(env.DISCORD_OAUTH_CLIENT_ID) && hasValue(env.DISCORD_OAUTH_CLIENT_SECRET) && hasValue(env.DISCORD_OAUTH_REDIRECT_URI),
      required: env.DISCORD_OAUTH_ENABLED,
    },
  ];

  const aiProviders = [
    { name: 'gemini', enabled: true, configured: hasValue(env.GEMINI_API_KEY) },
    { name: 'openai', enabled: true, configured: hasValue(env.OPENAI_API_KEY) },
    { name: 'anthropic', enabled: true, configured: hasValue(env.ANTHROPIC_API_KEY) },
    { name: 'deepseek', enabled: true, configured: hasValue(env.DEEPSEEK_API_KEY) },
    { name: 'kimi', enabled: true, configured: hasValue(env.KIMI_API_KEY) },
    { name: 'qwen', enabled: true, configured: hasValue(env.QWEN_API_KEY) },
  ];

  const discoveryProviders = [
    {
      name: 'serper',
      enabled: env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED,
      configured: hasValue(env.SERPER_API_KEY),
      required: env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED && env.SEARCH_METADATA_PROVIDER_PRIMARY === 'serper',
    },
    {
      name: 'serpapi',
      enabled: env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED || env.LIVE_SERP_DISCOVERY_ENABLED,
      configured: hasValue(env.SERPAPI_API_KEY),
      required: env.LIVE_SERP_DISCOVERY_ENABLED || env.SEARCH_METADATA_PROVIDER_FALLBACK === 'serpapi',
    },
    {
      name: 'google_places',
      enabled: true,
      configured: hasValue(env.GOOGLE_PLACES_API_KEY),
      required: false,
    },
  ];

  const emailConfigured = hasValue(env.SMTP_HOST)
    && hasValue(env.SMTP_USER)
    && hasValue(env.SMTP_PASS)
    && hasValue(env.EMAIL_FROM);
  const oauthSummary = buildSafeProviderSummary(oauthProviders);
  const aiSummary = buildSafeProviderSummary(aiProviders);
  const discoverySummary = buildSafeProviderSummary(discoveryProviders);

  const categories = {
    runtime: {
      nodeEnv: env.NODE_ENV,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      logLevel: env.LOG_LEVEL,
    },
    security: {
      cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
      csrfCookieSecure: env.CSRF_COOKIE_SECURE ?? env.NODE_ENV === 'production',
      cookieSameSite: env.COOKIE_SAME_SITE,
      csrfCookieSameSite: env.CSRF_COOKIE_SAME_SITE,
      trustProxy: env.TRUST_PROXY,
      authAbuseProtectionEnabled: safeBoolean(env.AUTH_ABUSE_PROTECTION_ENABLED),
      botChallengeEnabled: safeBoolean(env.BOT_CHALLENGE_ENABLED),
      botChallengeConfigured: !env.BOT_CHALLENGE_ENABLED || (hasValue(env.TURNSTILE_SITE_KEY) && hasValue(env.TURNSTILE_SECRET_KEY)),
    },
    email: {
      enabled: true,
      configured: emailConfigured,
      status: statusFor({ configured: emailConfigured, required: env.NODE_ENV === 'production' }),
    },
    oauth: {
      enabled: safeBoolean(env.OAUTH_ENABLED),
      status: env.OAUTH_ENABLED && oauthSummary.enabledCount > 0 && oauthSummary.configuredCount === 0
        ? 'not_configured'
        : statusFor({ enabled: env.OAUTH_ENABLED, configured: !env.OAUTH_ENABLED || oauthSummary.configuredCount > 0 }),
      ...oauthSummary,
    },
    ai: {
      enabled: safeBoolean(env.AI_ENABLED || env.AI_ANALYSIS_ENABLED),
      dashboardSecretManagementEnabled: safeBoolean(env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED),
      configuredProvidersCount: aiSummary.configuredCount,
      defaultTaskProvider: env.AI_DEFAULT_TASK_PROVIDER || null,
      rawPayloadStorageEnabled: safeBoolean(env.AI_STORE_RAW_PAYLOADS),
      promptLoggingEnabled: safeBoolean(env.AI_LOG_PROMPTS),
      responseLoggingEnabled: safeBoolean(env.AI_LOG_RESPONSES),
      providers: aiSummary.providers,
    },
    liveDiscovery: {
      enabled: safeBoolean(env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED || env.LIVE_SERP_DISCOVERY_ENABLED),
      dashboardSecretManagementEnabled: safeBoolean(env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED),
      configuredProvidersCount: discoverySummary.configuredCount,
      primaryProvider: env.SEARCH_METADATA_PROVIDER_PRIMARY,
      fallbackProvider: env.SEARCH_METADATA_PROVIDER_FALLBACK,
      providers: discoverySummary.providers,
    },
    openWebEvidence: {
      enabled: safeBoolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
      searchAssistEnabled: safeBoolean(env.OPEN_WEB_EVIDENCE_ENABLE_SEARCH_ASSIST),
      websiteJobsEnabled: safeBoolean(env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS),
      provider: env.OPEN_WEB_EVIDENCE_PROVIDER,
      failOpen: safeBoolean(env.OPEN_WEB_EVIDENCE_FAIL_OPEN),
      timeoutMs: env.OPEN_WEB_EVIDENCE_TIMEOUT_MS,
      commonCrawlIndexId: env.COMMON_CRAWL_INDEX_ID,
      warcFetchEnabled: safeBoolean(env.COMMON_CRAWL_FETCH_WARC_ENABLED),
      watFetchEnabled: safeBoolean(env.COMMON_CRAWL_FETCH_WAT_ENABLED),
      maxWarcBytes: env.COMMON_CRAWL_MAX_WARC_BYTES,
    },
    websiteJobs: {
      maxItems: env.WEBSITE_ENRICHMENT_JOB_MAX_ITEMS,
      concurrency: env.WEBSITE_ENRICHMENT_JOB_CONCURRENCY,
      itemDelayMs: env.WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS,
      staleTimeoutMinutes: env.JOB_STALE_TIMEOUT_MINUTES,
    },
    workers: {
      enabled: safeBoolean(env.ENABLE_WORKER),
      queueDriver: env.QUEUE_DRIVER,
      maxSearchWorkerConcurrency: env.MAX_SEARCH_WORKER_CONCURRENCY,
    },
    uploads: {
      adminUploadDirConfigured: hasValue(env.ADMIN_UPLOAD_DIR),
      datasetImportDirConfigured: hasValue(env.DATASET_IMPORT_DIR),
      ttlMinutes: env.IMPORT_UPLOAD_TTL_MINUTES,
      status: hasValue(env.ADMIN_UPLOAD_DIR) ? 'configured' : 'local_disk_warning',
    },
  };

  const warnings = buildProductionWarnings({ categories });
  return {
    categories,
    warnings,
    warningCount: warnings.length,
  };
};

const buildReadinessReport = ({ databaseStatus }) => {
  const configuration = buildConfigurationSummary();
  const blockingIssues = [];
  if (!databaseStatus.ok) blockingIssues.push('DATABASE_UNAVAILABLE');

  return {
    ok: databaseStatus.ok,
    status: blockingIssues.length ? 'not_ready' : (configuration.warnings.some((warning) => warning.severity === 'ERROR') ? 'degraded' : 'ready'),
    service: 'findly-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    database: databaseStatus.status,
    databaseStatus,
    configuration,
    blockingIssues,
  };
};

healthRouter.get('/', (_req, res) => {
  return successResponse(
    res,
    {
      ok: true,
      service: 'findly-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
    },
    'Backend is healthy.',
  );
});

const readyHandler = async (_req, res) => {
  const databaseStartedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const report = buildReadinessReport({
      databaseStatus: {
        ok: true,
        status: 'ok',
        responseTimeMs: elapsedMs(databaseStartedAt),
      },
    });

    return successResponse(
      res,
      report,
      report.status === 'ready' ? 'Backend is ready.' : 'Backend is ready with warnings.',
    );
  } catch {
    return errorResponse(
      res,
      errorCodes.INTERNAL_ERROR,
      'Readiness check failed.',
      503,
      {
        component: 'database',
        timestamp: new Date().toISOString(),
      },
    );
  }
};

healthRouter.get('/ready', readyHandler);
readyRouter.get('/', readyHandler);
