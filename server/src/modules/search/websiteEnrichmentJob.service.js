import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { assertSourceAllowedForStage, STAGES } from './sourceIntelligencePolicy.service.js';
import { enrichLeadWebsite, normalizeWebsiteUrl } from './websiteMetadata.service.js';
import { lookupOpenWebEvidence } from './openWebEvidence.service.js';

export const WEBSITE_ENRICHMENT_JOB_TYPE = 'WEBSITE_ENRICHMENT_RUN';

const TARGET_TYPES = new Set(['CATALOG_LEAD']);
const MODES = new Set(['EXPLICIT_IDS', 'RECENT_CATALOG_LEADS_WITH_WEBSITE']);
const ITEM_STATUSES = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']);

const nowIso = () => new Date().toISOString();

const maxItemsLimit = () => Math.min(100, env.WEBSITE_ENRICHMENT_JOB_MAX_ITEMS || 25);

const lockStaleBefore = () => new Date(Date.now() - (env.JOB_STALE_TIMEOUT_MINUTES * 60 * 1000));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uniqueIds = (ids = []) => {
  const seen = new Set();
  const output = [];
  for (const id of ids) {
    const value = String(id || '').trim();
    if (!value) continue;
    if (seen.has(value)) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Duplicate catalog lead IDs are not allowed.', 400);
    }
    seen.add(value);
    output.push(value);
  }
  return output;
};

const countByStatus = (items) => ({
  pendingItems: items.filter((item) => item.status === 'QUEUED').length,
  processingItems: items.filter((item) => item.status === 'RUNNING').length,
  succeededItems: items.filter((item) => item.status === 'SUCCEEDED').length,
  failedItems: items.filter((item) => item.status === 'FAILED').length,
  skippedItems: items.filter((item) => item.status === 'SKIPPED').length,
});

const buildPayload = ({
  targetType,
  mode,
  forceRefresh,
  items,
  summary = {},
  completedAt = null,
  startedAt = null,
}) => {
  const counters = countByStatus(items);
  return {
    version: 1,
    targetType,
    mode,
    forceRefresh: Boolean(forceRefresh),
    totalItems: items.length,
    ...counters,
    startedAt,
    completedAt,
    summary,
    items,
  };
};

const finalJobStatusForItems = (items) => (
  items.every((item) => item.status !== 'QUEUED' && item.status !== 'RUNNING') ? 'COMPLETED' : 'QUEUED'
);

const itemForCatalogLead = ({ lead, forceSkipped = false }) => {
  const base = {
    id: crypto.randomUUID(),
    leadId: null,
    catalogLeadId: lead.id,
    businessName: lead.businessName || null,
    websiteUrl: lead.websiteUrl || null,
    normalizedWebsiteUrl: null,
    status: 'QUEUED',
    evidenceId: null,
    cached: false,
    reachable: null,
    errorCode: null,
    errorMessage: null,
    signalsSummary: null,
    startedAt: null,
    completedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!lead.websiteUrl) {
    return {
      ...base,
      status: 'SKIPPED',
      errorCode: 'WEBSITE_URL_MISSING',
      errorMessage: 'Catalog lead does not have a website URL.',
      completedAt: nowIso(),
    };
  }

  try {
    return {
      ...base,
      normalizedWebsiteUrl: normalizeWebsiteUrl(lead.websiteUrl),
      status: forceSkipped ? 'SKIPPED' : 'QUEUED',
    };
  } catch {
    return {
      ...base,
      status: 'FAILED',
      errorCode: 'UNSAFE_WEBSITE_URL',
      errorMessage: 'Catalog lead website URL is not safe for enrichment.',
      completedAt: nowIso(),
    };
  }
};

const signalSummary = (signals = []) => {
  const summary = {
    opportunities: 0,
    warnings: 0,
    errors: 0,
    positives: 0,
    info: 0,
    keys: [],
  };

  for (const signal of signals.slice(0, 20)) {
    if (signal?.key && summary.keys.length < 12 && !summary.keys.includes(signal.key)) summary.keys.push(signal.key);
    switch (signal?.severity) {
      case 'OPPORTUNITY':
        summary.opportunities += 1;
        break;
      case 'WARNING':
        summary.warnings += 1;
        break;
      case 'ERROR':
        summary.errors += 1;
        break;
      case 'POSITIVE':
        summary.positives += 1;
        break;
      default:
        summary.info += 1;
        break;
    }
  }

  return summary;
};

const safeError = (error) => ({
  errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
  errorMessage: error instanceof AppError ? error.message : 'Website enrichment failed safely.',
});

export const buildWebsiteEnrichmentJobItemDto = (item) => ({
  id: item.id,
  leadId: item.leadId || null,
  catalogLeadId: item.catalogLeadId || null,
  businessName: item.businessName || null,
  websiteUrl: item.websiteUrl || null,
  normalizedWebsiteUrl: item.normalizedWebsiteUrl || null,
  status: ITEM_STATUSES.has(item.status) ? item.status : 'FAILED',
  evidenceId: item.evidenceId || null,
  cached: Boolean(item.cached),
  reachable: item.reachable ?? null,
  errorCode: item.errorCode || null,
  errorMessage: item.errorMessage || null,
  signalsSummary: item.signalsSummary || null,
  openWebEvidence: item.openWebEvidence || null,
  startedAt: item.startedAt || null,
  completedAt: item.completedAt || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
});

export const buildWebsiteEnrichmentJobDto = (job, { includeItems = false } = {}) => {
  const payload = job.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const counters = countByStatus(items);
  return {
    id: job.id,
    status: job.status,
    targetType: payload.targetType || null,
    mode: payload.mode || null,
    forceRefresh: Boolean(payload.forceRefresh),
    totalItems: payload.totalItems ?? items.length,
    ...counters,
    startedAt: job.startedAt || payload.startedAt || null,
    completedAt: job.completedAt || payload.completedAt || null,
    failedAt: job.failedAt || null,
    errorMessage: job.errorMessage || null,
    summary: payload.summary || {},
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(includeItems ? { items: items.map(buildWebsiteEnrichmentJobItemDto) } : {}),
  };
};

const loadCatalogLeadsForJob = async ({ mode, catalogLeadIds, limit }) => {
  if (mode === 'EXPLICIT_IDS') {
    const ids = uniqueIds(catalogLeadIds);
    if (!ids.length) throw new AppError(errorCodes.VALIDATION_ERROR, 'At least one catalog lead ID is required.', 400);
    if (ids.length > maxItemsLimit()) {
      throw new AppError(errorCodes.VALIDATION_ERROR, `Website enrichment jobs are limited to ${maxItemsLimit()} items.`, 400);
    }
    return prisma.leadCatalog.findMany({
      where: { id: { in: ids } },
      select: { id: true, businessName: true, websiteUrl: true },
      orderBy: { createdAt: 'desc' },
    }).then((leads) => {
      const found = new Set(leads.map((lead) => lead.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) {
        throw new AppError(errorCodes.VALIDATION_ERROR, `Catalog lead IDs not found: ${missing.join(', ')}`, 400);
      }
      return leads;
    });
  }

  if (mode === 'RECENT_CATALOG_LEADS_WITH_WEBSITE') {
    const safeLimit = Math.min(Number(limit || maxItemsLimit()), maxItemsLimit());
    return prisma.leadCatalog.findMany({
      where: { websiteUrl: { not: null } },
      select: { id: true, businessName: true, websiteUrl: true },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
  }

  throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported website enrichment job mode.', 400);
};

export const createWebsiteEnrichmentJob = async ({
  requestedByUserId,
  workspaceId,
  targetType = 'CATALOG_LEAD',
  mode = 'EXPLICIT_IDS',
  catalogLeadIds = [],
  limit,
  forceRefresh = false,
} = {}) => {
  const policyCheck = assertSourceAllowedForStage('WEBSITE_METADATA', STAGES.WEBSITE_ENRICHMENT);
  if (!policyCheck.allowed) throw new AppError(errorCodes.FORBIDDEN, policyCheck.reason, 403);
  if (!requestedByUserId || !workspaceId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'requestedByUserId and workspaceId are required.', 400);
  }
  if (!TARGET_TYPES.has(targetType)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported website enrichment job targetType.', 400);
  }
  if (!MODES.has(mode)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported website enrichment job mode.', 400);
  }

  const leads = await loadCatalogLeadsForJob({ mode, catalogLeadIds, limit });
  if (!leads.length) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'No matching catalog leads were found for website enrichment.', 400);
  }

  const items = leads.slice(0, maxItemsLimit()).map((lead) => itemForCatalogLead({ lead }));
  const payload = buildPayload({
    targetType,
    mode,
    forceRefresh,
    items,
    summary: {
      maxItems: maxItemsLimit(),
      skippedAtCreation: items.filter((item) => item.status === 'SKIPPED' || item.status === 'FAILED').length,
    },
  });
  const status = finalJobStatusForItems(items);

  const job = await prisma.job.create({
    data: {
      type: WEBSITE_ENRICHMENT_JOB_TYPE,
      status,
      userId: requestedByUserId,
      workspaceId,
      payload,
      startedAt: status === 'COMPLETED' ? new Date() : null,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });

  return buildWebsiteEnrichmentJobDto(job, { includeItems: true });
};

export const listWebsiteEnrichmentJobs = async ({ page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where: { type: WEBSITE_ENRICHMENT_JOB_TYPE },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.job.count({ where: { type: WEBSITE_ENRICHMENT_JOB_TYPE } }),
  ]);

  return {
    jobs: jobs.map((job) => buildWebsiteEnrichmentJobDto(job)),
    pagination: { page: safePage, limit: safeLimit, total },
  };
};

export const getWebsiteEnrichmentJob = async ({ jobId, includeItems = true } = {}) => {
  const job = await prisma.job.findFirst({
    where: { id: jobId, type: WEBSITE_ENRICHMENT_JOB_TYPE },
  });
  if (!job) throw new AppError(errorCodes.NOT_FOUND, 'Website enrichment job not found.', 404);
  return buildWebsiteEnrichmentJobDto(job, { includeItems });
};

const persistJobItems = async ({ jobId, items, status, startedAt = null, completedAt = null, summary = {} }) => {
  const payload = buildPayload({
    targetType: 'CATALOG_LEAD',
    mode: summary.mode,
    forceRefresh: summary.forceRefresh,
    items,
    summary,
    startedAt,
    completedAt,
  });

  return prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      payload,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      completedAt: completedAt ? new Date(completedAt) : undefined,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      lockedAt: null,
      lockedBy: null,
      lastHeartbeatAt: null,
    },
  });
};

const acquireProcessingLock = async ({ jobId, useExistingLock = false }) => {
  const job = await prisma.job.findFirst({
    where: { id: jobId, type: WEBSITE_ENRICHMENT_JOB_TYPE },
  });
  if (!job) throw new AppError(errorCodes.NOT_FOUND, 'Website enrichment job not found.', 404);
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return { job, lockOwner: job.lockedBy || null, acquired: false };
  }

  if (useExistingLock) {
    return { job, lockOwner: job.lockedBy || 'existing-worker-lock', acquired: true };
  }

  const lockOwner = `website-enrichment:${process.pid}:${crypto.randomUUID()}`;
  const now = new Date();
  const result = await prisma.job.updateMany({
    where: {
      id: jobId,
      type: WEBSITE_ENRICHMENT_JOB_TYPE,
      status: { in: ['QUEUED', 'RUNNING'] },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: lockStaleBefore() } },
      ],
    },
    data: {
      status: 'RUNNING',
      lockedAt: now,
      lockedBy: lockOwner,
      lastHeartbeatAt: now,
      startedAt: job.startedAt || now,
    },
  });

  if (result.count !== 1) {
    const current = await prisma.job.findFirst({
      where: { id: jobId, type: WEBSITE_ENRICHMENT_JOB_TYPE },
    });
    if (current?.status === 'COMPLETED' || current?.status === 'FAILED' || current?.status === 'CANCELLED') {
      return { job: current, lockOwner: current.lockedBy || null, acquired: false };
    }
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Website enrichment job is already running.', 409);
  }

  const lockedJob = await prisma.job.findFirst({
    where: { id: jobId, type: WEBSITE_ENRICHMENT_JOB_TYPE },
  });
  return { job: lockedJob, lockOwner, acquired: true };
};

export const processWebsiteEnrichmentJob = async ({ jobId, maxItems, fetcher, useExistingLock = false } = {}) => {
  const { job, lockOwner, acquired } = await acquireProcessingLock({ jobId, useExistingLock });
  if (!acquired) return buildWebsiteEnrichmentJobDto(job, { includeItems: true });

  const heartbeat = () => prisma.job.updateMany({
    where: {
      id: job.id,
      type: WEBSITE_ENRICHMENT_JOB_TYPE,
      status: 'RUNNING',
      ...(useExistingLock ? {} : { lockedBy: lockOwner }),
    },
    data: { lastHeartbeatAt: new Date() },
  });

  const payload = job.payload || {};
  const items = Array.isArray(payload.items) ? payload.items.map((item) => ({ ...item })) : [];
  const startedAt = job.startedAt?.toISOString?.() || payload.startedAt || nowIso();
  const limit = Math.min(maxItems || maxItemsLimit(), maxItemsLimit());
  const queuedIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === 'QUEUED')
    .slice(0, limit);

  if (!queuedIndexes.length) {
    const completedAt = nowIso();
    const updated = await persistJobItems({
      jobId,
      items,
      status: 'COMPLETED',
      startedAt,
      completedAt,
      summary: {
        ...(payload.summary || {}),
        mode: payload.mode,
        forceRefresh: payload.forceRefresh,
        processedAt: completedAt,
      },
    });
    return buildWebsiteEnrichmentJobDto(updated, { includeItems: true });
  }

  let processed = 0;
  for (const { item, index } of queuedIndexes) {
    const itemStartedAt = nowIso();
    items[index] = { ...item, status: 'RUNNING', startedAt: itemStartedAt, updatedAt: itemStartedAt };
    await heartbeat();

    try {
      const openWebEvidence = env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS
        ? await lookupOpenWebEvidence({
            websiteUrl: item.normalizedWebsiteUrl || item.websiteUrl,
            forceRefresh: Boolean(payload.forceRefresh),
          })
        : null;
      const result = await enrichLeadWebsite({
        catalogLeadId: item.catalogLeadId,
        websiteUrl: item.normalizedWebsiteUrl || item.websiteUrl,
        requestedByUserId: job.userId,
        workspaceId: job.workspaceId,
        forceRefresh: Boolean(payload.forceRefresh),
        prefetchedOpenWebEvidence: openWebEvidence,
        ...(fetcher ? { fetcher } : {}),
      });
      const completed = nowIso();
      items[index] = {
        ...items[index],
        status: 'SUCCEEDED',
        evidenceId: result.evidenceId || null,
        cached: Boolean(result.cached),
        reachable: Boolean(result.reachable),
        errorCode: null,
        errorMessage: null,
        signalsSummary: signalSummary(result.signals || []),
        openWebEvidence: openWebEvidence?.found
          ? {
              used: true,
              cached: Boolean(openWebEvidence.fromCache),
              confidenceScore: openWebEvidence.confidenceScore,
              signalsCount: openWebEvidence.signals?.length || 0,
            }
          : null,
        completedAt: completed,
        updatedAt: completed,
      };
    } catch (error) {
      const completed = nowIso();
      const safe = safeError(error);
      items[index] = {
        ...items[index],
        status: 'FAILED',
        cached: false,
        reachable: false,
        ...safe,
        completedAt: completed,
        updatedAt: completed,
      };
    }

    processed += 1;
    if (
      processed < queuedIndexes.length
      && env.NODE_ENV !== 'test'
      && env.WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS > 0
    ) {
      await delay(env.WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS);
    }
  }

  const remainingQueued = items.some((item) => item.status === 'QUEUED' || item.status === 'RUNNING');
  const completedAt = remainingQueued ? null : nowIso();
  const updated = await persistJobItems({
    jobId,
    items,
    status: remainingQueued ? 'QUEUED' : 'COMPLETED',
    startedAt,
    completedAt,
    summary: {
      ...(payload.summary || {}),
      mode: payload.mode,
      forceRefresh: payload.forceRefresh,
      lastProcessedAt: nowIso(),
      processedItemsLastRun: processed,
      delayMs: env.WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS,
      concurrencyReserved: env.WEBSITE_ENRICHMENT_JOB_CONCURRENCY,
    },
  });

  return buildWebsiteEnrichmentJobDto(updated, { includeItems: true });
};
