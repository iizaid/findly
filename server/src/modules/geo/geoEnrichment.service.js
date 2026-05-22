import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { enqueueJob } from '../jobs/jobQueue.service.js';
import { geocodeBusinessLocation } from './geoProvider.service.js';
import { leadGeoSelect, shouldSkipGeoEnrichment, toGeoInput } from './leadGeoEligibility.service.js';
import { GEO_STATUS } from './geoValidation.service.js';

export const GEO_ENRICHMENT_JOB_TYPE = 'GEO_ENRICHMENT_RUN';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildLeadSelect = {
  ...leadGeoSelect,
  workspaceId: true,
};

const buildCatalogInclude = {
  id: true,
  leadListId: true,
  catalogLeadId: true,
  leadId: true,
  lead: { select: buildLeadSelect },
  catalogLead: { select: leadGeoSelect },
  leadList: { select: { workspaceId: true } },
};

const setLeadGeoPoint = async (tx, id, longitude, latitude) => tx.$executeRaw`
  UPDATE "Lead"
  SET "geoPoint" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
  WHERE "id" = ${id}
`;

const setLeadCatalogGeoPoint = async (tx, id, longitude, latitude) => tx.$executeRaw`
  UPDATE "LeadCatalog"
  SET "geoPoint" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
  WHERE "id" = ${id}
`;

const updateDirectLeadGeo = async (tx, lead, result) => {
  const data = {
    geoStatus: result.geoStatus,
    geoSource: 'GEOCODER',
    geoProvider: result.provider,
    geoConfidence: result.confidence || 0,
    geoAccuracy: result.accuracy || null,
    geoAddressNormalized: result.normalizedAddress || null,
    geoUpdatedAt: new Date(),
    geoFailedAt: result.ok ? null : new Date(),
    geoFailureReason: result.ok ? null : result.reason,
  };

  if (result.ok) {
    data.latitude = result.latitude;
    data.longitude = result.longitude;
    data.geoResolvedAt = new Date();
    data.geoFailedAt = null;
    data.geoFailureReason = null;
  }

  await tx.lead.update({
    where: { id: lead.id },
    data,
  });

  if (result.ok) {
    await setLeadGeoPoint(tx, lead.id, result.longitude, result.latitude);
  }
};

const updateCatalogLeadGeo = async (tx, lead, result) => {
  const data = {
    geoStatus: result.geoStatus,
    geoSource: 'GEOCODER',
    geoProvider: result.provider,
    geoConfidence: result.confidence || 0,
    geoAccuracy: result.accuracy || null,
    geoAddressNormalized: result.normalizedAddress || null,
    geoUpdatedAt: new Date(),
    geoFailedAt: result.ok ? null : new Date(),
    geoFailureReason: result.ok ? null : result.reason,
  };

  if (result.ok) {
    data.latitude = result.latitude;
    data.longitude = result.longitude;
    data.geoResolvedAt = new Date();
    data.geoFailedAt = null;
    data.geoFailureReason = null;
  }

  await tx.leadCatalog.update({
    where: { id: lead.id },
    data,
  });

  if (result.ok) {
    await setLeadCatalogGeoPoint(tx, lead.id, result.longitude, result.latitude);
  }
};

export const resolveAccessibleLeadTargets = async ({ userId, leadIds = [], listId = null }) => {
  const uniqueIds = [...new Set((leadIds || []).filter(Boolean))].slice(0, env.GEO_MAX_BATCH_SIZE);

  const [directLeads, listItems] = await Promise.all([
    uniqueIds.length
      ? prisma.lead.findMany({
        where: { id: { in: uniqueIds }, userId },
        select: buildLeadSelect,
      })
      : Promise.resolve([]),
    prisma.leadListLead.findMany({
      where: {
        leadList: {
          userId,
          ...(listId ? { id: listId } : {}),
        },
        ...(uniqueIds.length ? {
          OR: [
            { catalogLeadId: { in: uniqueIds } },
            { leadId: { in: uniqueIds } },
          ],
        } : {}),
      },
      select: buildCatalogInclude,
    }),
  ]);

  const catalogMap = new Map();
  for (const item of listItems) {
    if (!item.catalogLeadId || !item.catalogLead || catalogMap.has(item.catalogLeadId)) continue;
    catalogMap.set(item.catalogLeadId, {
      type: 'catalog',
      id: item.catalogLeadId,
      workspaceId: item.leadList.workspaceId,
      lead: item.catalogLead,
    });
  }

  const directMap = new Map(directLeads.map((lead) => [lead.id, {
    type: 'direct',
    id: lead.id,
    workspaceId: lead.workspaceId,
    lead,
  }]));

  for (const item of listItems) {
    if (!item.leadId || !item.lead || directMap.has(item.leadId)) continue;
    directMap.set(item.leadId, {
      type: 'direct',
      id: item.leadId,
      workspaceId: item.leadList.workspaceId,
      lead: item.lead,
    });
  }

  const catalogTargets = [...catalogMap.values()];
  return [...directMap.values(), ...catalogTargets];
};

export const enqueueGeoEnrichmentJob = async ({ userId, workspaceId, leadIds = [], listId = null, forceRefresh = false }) => {
  const cappedLeadIds = [...new Set((leadIds || []).filter(Boolean))].slice(0, env.GEO_MAX_BATCH_SIZE);
  if (!cappedLeadIds.length && !listId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'At least one lead must be selected.', 400);
  }

  return enqueueJob({
    userId,
    workspaceId,
    type: GEO_ENRICHMENT_JOB_TYPE,
    payload: {
      leadIds: cappedLeadIds,
      listId: listId || null,
      forceRefresh,
      summary: {
        processedItems: 0,
        resolvedItems: 0,
        lowConfidenceItems: 0,
        failedItems: 0,
        cacheHitCount: 0,
        providerCallCount: 0,
        durationMs: 0,
      },
    },
    maxAttempts: 2,
  });
};

export const processGeoEnrichmentJob = async ({ jobId }) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.type !== GEO_ENRICHMENT_JOB_TYPE) {
    throw new AppError(errorCodes.NOT_FOUND, 'Geo enrichment job not found.', 404);
  }

  const startedAt = Date.now();
  const targets = await resolveAccessibleLeadTargets({
    userId: job.userId,
    leadIds: job.payload?.leadIds || [],
    listId: job.payload?.listId || null,
  });

  const summary = {
    processedItems: 0,
    resolvedItems: 0,
    lowConfidenceItems: 0,
    failedItems: 0,
    cacheHitCount: 0,
    providerCallCount: 0,
    durationMs: 0,
  };

  const queue = [...targets];
  const workers = Array.from({ length: Math.min(env.GEO_ENRICHMENT_CONCURRENCY, queue.length || 1) }, () => (async () => {
    while (queue.length) {
      const target = queue.shift();
      if (!target) return;
      const lead = target.lead;

      if (shouldSkipGeoEnrichment(lead, Boolean(job.payload?.forceRefresh))) {
        summary.processedItems += 1;
        continue;
      }

      const result = await geocodeBusinessLocation(toGeoInput(lead), { failOpen: env.GEO_PROVIDER_FAIL_OPEN });
      summary.processedItems += 1;
      if (result.cacheHit) summary.cacheHitCount += 1;
      if (!result.cacheHit) summary.providerCallCount += 1;

      if (result.geoStatus === GEO_STATUS.RESOLVED) summary.resolvedItems += 1;
      else if (result.geoStatus === GEO_STATUS.LOW_CONFIDENCE) summary.lowConfidenceItems += 1;
      else summary.failedItems += 1;

      await prisma.$transaction(async (tx) => {
        if (target.type === 'direct') await updateDirectLeadGeo(tx, lead, result);
        else await updateCatalogLeadGeo(tx, lead, result);
      });

      if (env.GEO_ENRICHMENT_ITEM_DELAY_MS > 0) {
        await sleep(env.GEO_ENRICHMENT_ITEM_DELAY_MS);
      }
    }
  })());

  await Promise.all(workers);
  summary.durationMs = Date.now() - startedAt;

  logger.info('geo_enrichment.job.completed', { jobId, ...summary });
  return {
    processedItems: summary.processedItems,
    resolvedItems: summary.resolvedItems,
    lowConfidenceItems: summary.lowConfidenceItems,
    failedItems: summary.failedItems,
    cacheHitCount: summary.cacheHitCount,
    providerCallCount: summary.providerCallCount,
    durationMs: summary.durationMs,
  };
};
