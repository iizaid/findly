import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import {
  calculateSearchCreditCost,
  captureSearchCreditReservation,
  deductCredits,
  estimateSearchCreditReservation,
  releaseSearchCreditReservation,
  SEARCH_BASE_CREDITS,
  SEARCH_PER_RETURNED_LEAD_CREDITS,
} from '../credits/credit.service.js';
import { runRuleBasedAnalysis } from './analysis.service.js';
import { estimateSourceCost, getRunnableAdapter } from './source.registry.js';
import { logger } from '../../utils/logger.js';
import { findDuplicateLead } from './leadDeduplication.js';
import {
  markCampaignCompleted,
  markCampaignFailed,
  markCampaignRunning,
  RUNNABLE_CAMPAIGN_STATUSES,
  updateCampaignProgress,
} from './campaignJob.service.js';
import { markJobCompleted, markJobFailed, markJobRunning } from '../jobs/jobQueue.service.js';
import { LocalDatasetAdapter } from './adapters/LocalDatasetAdapter.js';
import { GooglePlacesAdapter } from './adapters/GooglePlacesAdapter.js';
import { SerpAdapter } from './adapters/SerpAdapter.js';
import { env } from '../../config/env.js';
import { buildDiscoveryPlan, normalizeCampaignTargeting } from './sourceTargetMapping.service.js';
import { assertDiscoveryBudget } from './campaignBudget.service.js';
import { createDiscoveryQuery, recordLeadEvidence } from './discoveryEvidence.service.js';
import { promoteHighConfidenceEvidenceBatch } from './evidencePromotion.service.js';
import {
  buildLayeredSearchMessage,
  shouldUseLayeredDiscovery,
} from './layeredDiscovery.service.js';
import { runDiscoveryOrchestrator } from './discoveryOrchestrator.service.js';

const LOCAL_DATASET_SOURCES = ['LOCAL_DATASET', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'DATASET_IMPORT', 'MANUAL_ADMIN'];
const LOCAL_FALLBACK_SOURCE_KEYS = ['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP', 'SERPAPI', 'TRIPADVISOR', 'YOUTUBE', 'X', 'LINKEDIN', 'TIKTOK', 'REDDIT'];
const SEARCH_METADATA_SOURCE_KEYS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'X', 'TRIPADVISOR', 'YELP', 'REDDIT', 'SERPAPI'];
const SOURCE_TO_DISCOVERY_METHOD = {
  GOOGLE_MAPS: 'GOOGLE_PLACES',
  SERPAPI: 'SERPAPI_DISCOVERY',
  WEBSITE: 'WEBSITE_METADATA',
};

const fallbackReasonFor = (sources = [], presenceTargets = []) => {
  if (sources.includes('GOOGLE_MAPS')) return 'GOOGLE_PLACES_NOT_CONNECTED_USING_LOCAL_CACHE';
  if (sources.includes('SERPAPI')) return 'SEARCH_METADATA_DISCOVERY_DISABLED_USING_LOCAL_CACHE';
  if (presenceTargets.some((source) => ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'X', 'TRIPADVISOR', 'YELP', 'REDDIT'].includes(source))) {
    return 'PRESENCE_TARGET_USING_LOCAL_CACHE';
  }
  if (sources.includes('WEBSITE')) return 'WEBSITE_ENRICHMENT_SEARCH_NOT_CONNECTED';
  return 'PROVIDERS_NOT_CONNECTED';
};

const preferredEvidenceUrl = (lead) => lead.instagramUrl
  || lead.facebookUrl
  || lead.googleMapsUrl
  || lead.websiteUrl
  || null;

const primaryTargetSource = (sources = []) => sources.find((source) => source && source !== 'LOCAL_DATASET') || 'LOCAL_DATASET';

const buildEvidenceFields = (lead) => ({
  businessName: lead.businessName,
  category: lead.category,
  country: lead.country,
  city: lead.city,
  address: lead.address,
  websiteUrl: lead.websiteUrl,
  instagramUrl: lead.instagramUrl,
  instagramUsername: lead.instagramUsername,
  facebookUrl: lead.facebookUrl,
  googleMapsUrl: lead.googleMapsUrl,
  phone: lead.phone,
  email: lead.email,
  rating: lead.rating,
  reviewCount: lead.reviewCount,
  source: lead.source,
});

const evidenceCandidateFromLead = ({ lead, targetSource, discoveryMethod, sourceType, confidenceScore = 75 }) => ({
  targetSource,
  discoveryMethod,
  sourceType,
  sourceUrl: preferredEvidenceUrl(lead),
  externalId: lead.sourceId || null,
  title: lead.businessName,
  snippet: lead.category || lead.address || null,
  extractedFields: buildEvidenceFields(lead),
  rawMetadata: lead.rawData,
  confidenceScore,
  attributionRequired: lead.source === 'GOOGLE_MAPS',
});

const summarizeDiscoveryPlan = (discoveryPlan) => ({
  targetSources: discoveryPlan?.targetSources || [],
  methods: (discoveryPlan?.mappings || []).map((mapping) => ({
    targetSource: mapping.targetSource,
    discoveryMethod: mapping.discoveryMethod,
    adapter: mapping.adapter,
    runnable: Boolean(mapping.runnable),
    targetOnly: Boolean(mapping.targetOnly),
    enrichmentOnly: Boolean(mapping.enrichmentOnly),
  })),
});

const _runExternalDiscoveryIfNeeded = async ({ campaign, _localResults, _evidenceCandidates, discoveryDecision }) => {
  const missingResultCount = discoveryDecision.missingCount;
  
  const metadata = {
    externalDiscoveryUsed: false,
    externalProvider: null,
    externalDiscoverySkippedReason: discoveryDecision.skippedReasons[0] || null,
    searchMetadataProviderPrimary: env.SEARCH_METADATA_PROVIDER_PRIMARY,
    searchMetadataProviderUsed: null,
    searchMetadataFallbackUsed: false,
    searchMetadataQueriesUsed: 0,
    searchMetadataProviderStats: [],
    externalCostEstimate: 0,
    discoveryDecision: {
       stageDecision: discoveryDecision.stageDecision,
       skippedReasons: discoveryDecision.skippedReasons,
       riskWarnings: discoveryDecision.riskWarnings,
       sourcePolicyWarnings: discoveryDecision.sourcePolicyWarnings,
       savedExternalCalls: discoveryDecision.savedExternalCalls,
    }
  };

  const candidates = [];
  
  if (discoveryDecision.stageDecision !== 'LIVE_DISCOVERY' || missingResultCount <= 0) {
    return { candidates, metadata };
  }

  // SEARCH METADATA
  if (discoveryDecision.runPaidSearchMetadata) {
    const plan = discoveryDecision.searchMetadataPlan;
    const canRunSerp = SerpAdapter.isConfigured();
    
    if (!canRunSerp) {
      metadata.externalDiscoverySkippedReason = 'SEARCH_METADATA_NOT_CONFIGURED';
    } else if (plan.maxQueriesAllowed > 0) {
      try {
        const adapter = new SerpAdapter(campaign, {
          targetSources: normalizeCampaignTargeting(campaign).presenceTargets.filter((source) => SEARCH_METADATA_SOURCE_KEYS.includes(source)),
          missingResultCount: Math.min(missingResultCount, plan.maxExternalResults),
        });
        candidates.push(...await adapter.run());
        metadata.externalDiscoveryUsed = candidates.length > 0;
        metadata.externalProvider = adapter.metadata?.providerUsed || 'SEARCH_METADATA';
        metadata.searchMetadataProviderUsed = adapter.metadata?.providerUsed || null;
        metadata.searchMetadataFallbackUsed = Boolean(adapter.metadata?.fallbackUsed);
        metadata.searchMetadataQueriesUsed = adapter.metadata?.queriesUsed || 0;
        metadata.searchMetadataProviderStats = adapter.metadata?.providerStats || [];
        metadata.externalCostEstimate += plan.maxQueriesAllowed * 1000;
        metadata.externalDiscoverySkippedReason = candidates.length > 0
          ? null
          : (adapter.metadata?.skippedReason || 'SEARCH_METADATA_NO_RESULTS');
      } catch (error) {
        metadata.externalDiscoverySkippedReason = error instanceof AppError && error.code === errorCodes.VALIDATION_ERROR
          ? 'BUDGET_LIMIT'
          : 'SEARCH_METADATA_UNAVAILABLE';
        logger.warn('campaign.search_metadata.discovery.skipped', {
          campaignId: campaign.id,
          reason: metadata.externalDiscoverySkippedReason,
          errorCode: error?.code,
          errorMessage: error?.message,
        });
      }
    }
  }

  // GOOGLE PLACES
  if (discoveryDecision.googlePlacesPlan?.shouldRun && candidates.length < missingResultCount) {
    const plan = discoveryDecision.googlePlacesPlan;
    if (!GooglePlacesAdapter.isConfigured()) {
      metadata.googlePlacesStatus = 'not_configured';
    } else {
      try {
        const adapter = new GooglePlacesAdapter({
          ...campaign,
          requestedLimit: Math.min(missingResultCount - candidates.length, discoveryDecision.searchMetadataPlan.maxExternalResults),
        });
        const googleLeads = await adapter.run();
        candidates.push(...googleLeads.map((lead) => evidenceCandidateFromLead({
          lead,
          targetSource: 'GOOGLE_MAPS',
          discoveryMethod: 'GOOGLE_PLACES',
          sourceType: 'GOOGLE_PLACES_RESULT',
          confidenceScore: 80,
        })));
        metadata.externalDiscoveryUsed = true;
        metadata.externalProvider = metadata.externalProvider || 'GOOGLE_PLACES';
        metadata.googlePlacesStatus = 'used';
        metadata.externalCostEstimate += plan.maxQueriesAllowed * 1500;
      } catch (error) {
        metadata.googlePlacesStatus = error instanceof AppError && error.code === errorCodes.VALIDATION_ERROR
          ? 'budget_limited'
          : 'unavailable';
        logger.warn('campaign.google_places.discovery.skipped', {
          campaignId: campaign.id,
          status: metadata.googlePlacesStatus,
        });
      }
    }
  }

  return {
    candidates: candidates.slice(0, missingResultCount),
    metadata,
  };
};

export const estimateSearchCreditsRequired = (requestedLimit) => estimateSearchCreditReservation({ requestedLimit });
export const calculateSearchCreditsUsed = (leadsCount) => calculateSearchCreditCost({ returnedLeadsCount: leadsCount });

const assertSearchCreditsAvailable = async ({ userId, requestedLimit }) => {
  const maxCreditsRequired = estimateSearchCreditsRequired(requestedLimit);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditsBalance: true } });
  if (!user || user.creditsBalance < maxCreditsRequired) {
    throw new AppError(errorCodes.INSUFFICIENT_FUNDS, `Not enough Opportunity Credits. Requires at least ${maxCreditsRequired} credits to run.`, 402);
  }
};

const hasActiveSearchReservation = async ({ userId, campaignId }) => {
  const reservation = await prisma.creditReservation.findFirst({
    where: { userId, campaignId, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(reservation);
};

const releaseReservedCreditsForFailedStart = async ({ userId, campaignId }) => {
  await prisma.$transaction(async (tx) => {
    await releaseSearchCreditReservation({ tx, userId, campaignId });
  }).catch(() => {});
};

const assertNotCancelled = async ({ jobId, campaignId }) => {
  if (jobId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true, cancelRequestedAt: true },
    });
    if (job?.status === 'CANCELLED' || job?.cancelRequestedAt) {
      throw new AppError('JOB_CANCELLED', 'Search campaign was cancelled.', 409);
    }
  }

  const campaign = await prisma.searchCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (campaign?.status === 'CANCELLED') {
    throw new AppError('JOB_CANCELLED', 'Search campaign was cancelled.', 409);
  }
};

const assertCampaignCanComplete = async ({ tx, jobId, campaignId, userId }) => {
  if (jobId) {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { status: true, cancelRequestedAt: true },
    });
    if (!job || job.status === 'CANCELLED' || job.cancelRequestedAt) {
      throw new AppError('JOB_CANCELLED', 'Search campaign was cancelled.', 409);
    }
  }

  const campaign = await tx.searchCampaign.findFirst({
    where: { id: campaignId, userId },
    select: { status: true },
  });
  if (!campaign || campaign.status === 'CANCELLED') {
    throw new AppError('JOB_CANCELLED', 'Search campaign was cancelled.', 409);
  }
  if (campaign.status !== 'RUNNING') {
    throw new AppError(errorCodes.CAMPAIGN_NOT_RUNNABLE, 'Campaign is no longer running.', 409);
  }
};
export const createCampaign = async ({ userId, workspaceId, data }) => {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.searchCampaign.create({
      data: {
        userId,
        workspaceId,
        name: data.name,
        query: data.query,
        country: data.country,
        city: data.city,
        businessTypes: data.businessTypes,
        sources: data.sources,
        filters: data.filters,
        requestedLimit: data.requestedLimit,
        serviceProfileId: data.serviceProfileId,
        status: 'DRAFT',
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'SEARCH_CAMPAIGN_CREATED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId,
          sources: data.sources,
          requestedLimit: data.requestedLimit,
        },
      },
    });

    return campaign;
  });
};

export const getCampaign = async (id, userId) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id, userId },
  });
  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);
  return campaign;
};

export const runCampaign = async (campaignId, userId, { jobId = null } = {}) => {
  const campaign = await getCampaign(campaignId, userId);

  if (!RUNNABLE_CAMPAIGN_STATUSES.includes(campaign.status)) {
    const code = campaign.status === 'RUNNING' || campaign.status === 'QUEUED'
      ? errorCodes.JOB_ALREADY_RUNNING
      : errorCodes.CAMPAIGN_NOT_RUNNABLE;
    throw new AppError(code, `Campaign cannot be run while status is ${campaign.status}.`, 409);
  }

  const targeting = normalizeCampaignTargeting(campaign);
  const rawSources = targeting.rawSources;
  const sources = targeting.discoverySources;
  const presenceTargets = targeting.presenceTargets;
  if (rawSources.length === 0 && presenceTargets.length === 0) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Campaign requires at least one source.', 400);
  }

  const normalizedCampaign = {
    ...campaign,
    filters: {
      ...(campaign.filters || {}),
      presenceTargets,
    },
    presenceTargets,
  };

  const executionCampaign = {
    ...normalizedCampaign,
    sources,
  };

  const discoveryPlan = buildDiscoveryPlan({ campaign: normalizedCampaign });
  const localDatasetRequested = rawSources.some((source) => LOCAL_DATASET_SOURCES.includes(source));
  const layeredDiscoveryEligible = shouldUseLayeredDiscovery(normalizedCampaign);
  const externalSourceKeys = sources.filter((source) => !LOCAL_DATASET_SOURCES.includes(source));
  const runnableSources = externalSourceKeys.map((source) => ({ source, ...getRunnableAdapter(source) }));
  const runnableExternalSources = runnableSources.filter((source) => source.runnable);
  const unavailable = runnableSources.find((source) => !source.runnable);

  const fallbackCandidates = rawSources.filter((source) => !LOCAL_DATASET_SOURCES.includes(source));
  const fallbackSourcesRequested = fallbackCandidates.some((source) => LOCAL_FALLBACK_SOURCE_KEYS.includes(source));
  const allUnavailableSourcesCanFallback = fallbackCandidates.length > 0
    && fallbackCandidates.every((source) => LOCAL_FALLBACK_SOURCE_KEYS.includes(source));
  const shouldUseLocalDataset = localDatasetRequested
    || (fallbackSourcesRequested && runnableExternalSources.length === 0 && allUnavailableSourcesCanFallback);

  if (layeredDiscoveryEligible || shouldUseLocalDataset) {
    if (!await hasActiveSearchReservation({ userId, campaignId: campaign.id })) {
      await assertSearchCreditsAvailable({ userId, requestedLimit: campaign.requestedLimit || 20 });
    }
    return runLocalDatasetCampaign({
      campaign: normalizedCampaign,
      userId,
      jobId,
      fallbackUsed: !localDatasetRequested,
      platformsRequested: [...new Set([...rawSources, ...presenceTargets])],
      discoveryPlan,
    });
  }

  if (unavailable && runnableExternalSources.length === 0) {
    const message = unavailable.status?.reason || `${unavailable.source} is not available.`;
    const code = unavailable.status?.status === 'not_configured' ? errorCodes.SOURCE_NOT_CONFIGURED : errorCodes.SOURCE_UNAVAILABLE;
    if (jobId) await releaseReservedCreditsForFailedStart({ userId, campaignId: campaign.id });
    throw new AppError(code, message, 400);
  }

  if (runnableExternalSources.length === 0) {
    if (jobId) await releaseReservedCreditsForFailedStart({ userId, campaignId: campaign.id });
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'No selected search source is currently available.', 400);
  }

  if (!await hasActiveSearchReservation({ userId, campaignId: campaign.id })) {
    await assertSearchCreditsAvailable({ userId, requestedLimit: campaign.requestedLimit || 20 });
  }
  assertDiscoveryBudget({
    campaign: executionCampaign,
    plannedDiscoveryCalls: runnableExternalSources.length,
    discoveryMethod: runnableExternalSources[0]?.source ? SOURCE_TO_DISCOVERY_METHOD[runnableExternalSources[0].source] : 'UNKNOWN',
  });

  await markCampaignRunning({
    campaignId: campaign.id,
    userId,
    requestedLimit: campaign.requestedLimit || 20,
    lockedBy: 'api',
  });
  if (jobId) {
    await markJobRunning({ jobId, workerId: 'inline-api-worker' });
  }

  logger.info('campaign.run.started', { userId, campaignId: campaign.id, workspaceId: campaign.workspaceId });

  try {
    await assertNotCancelled({ jobId, campaignId: campaign.id });
    const normalizedLeadGroups = [];
    for (const source of runnableExternalSources) {
      await prisma.searchCampaign.update({
        where: { id: campaign.id },
        data: { lastStep: `Searching ${source.status.label}` },
      });
      const adapter = new source.Adapter(executionCampaign);
      normalizedLeadGroups.push(...await adapter.run());
      await assertNotCancelled({ jobId, campaignId: campaign.id });
    }

    const normalizedLeads = normalizedLeadGroups.slice(0, campaign.requestedLimit || 20);
    await updateCampaignProgress({
      campaignId: campaign.id,
      progressCurrent: 0,
      progressTotal: normalizedLeads.length,
      lastStep: 'Scoring and preparing leads',
    });

    let savedLeadsCount = 0;
    let totalCreditsUsed = 0;
    
    // Deduplication & Saving inside transaction
    await prisma.$transaction(async (tx) => {
      await assertCampaignCanComplete({ tx, jobId, campaignId: campaign.id, userId });
      const discoveryQueriesByMethod = new Map();
      for (const source of runnableExternalSources) {
        const mapping = discoveryPlan.mappings.find((item) => item.selectedSource === source.source);
        const discoveryMethod = mapping?.discoveryMethod || SOURCE_TO_DISCOVERY_METHOD[source.source] || 'UNKNOWN';
        const discoveryQuery = await createDiscoveryQuery({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          seedQuery: campaign.query,
          expandedQuery: discoveryPlan.expandedQuery,
          geography: discoveryPlan.geography,
          targetSources: discoveryPlan.targetSources,
          discoveryMethod,
          adapter: source.source,
          status: 'COMPLETED',
        });
        discoveryQueriesByMethod.set(discoveryMethod, discoveryQuery.id);
      }

      const leadList = await tx.leadList.create({
        data: {
          name: `${campaign.name} - Results`,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
        },
      });
      await updateCampaignProgress({
        tx,
        campaignId: campaign.id,
        progressCurrent: 0,
        progressTotal: normalizedLeads.length,
        lastStep: 'Saving lead list',
      });

      for (const [index, lead] of normalizedLeads.entries()) {
        const existing = await findDuplicateLead({
          tx,
          workspaceId: campaign.workspaceId,
          lead,
        });

        if (!existing) {
          const newLead = await tx.lead.create({
            data: {
              ...lead,
              userId,
              workspaceId: campaign.workspaceId,
              leadListId: leadList.id,
              campaignId: campaign.id,
              country: campaign.country,
              city: campaign.city,
            },
          });
          const discoveryMethod = SOURCE_TO_DISCOVERY_METHOD[lead.source] || 'UNKNOWN';
          await recordLeadEvidence({
            tx,
            userId,
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            discoveryQueryId: discoveryQueriesByMethod.get(discoveryMethod) || null,
            leadId: newLead.id,
            targetSource: lead.source || 'UNKNOWN',
            discoveryMethod,
            sourceType: `${lead.source || 'UNKNOWN'}_RESULT`,
            sourceUrl: preferredEvidenceUrl(lead),
            externalId: lead.sourceId || null,
            title: lead.businessName,
            snippet: lead.category || lead.address || null,
            extractedFields: buildEvidenceFields(lead),
            rawMetadata: lead.rawData,
            confidenceScore: 75,
            attributionRequired: lead.source === 'GOOGLE_MAPS',
          });
          savedLeadsCount++;
          
          // Optionally run analysis right away if serviceProfileId exists
          if (campaign.serviceProfileId) {
            const profile = await tx.serviceProfile.findUnique({ where: { id: campaign.serviceProfileId } });
            if (profile) {
              await runRuleBasedAnalysis({ tx, lead: newLead, profile, userId, workspaceId: campaign.workspaceId, campaignId: campaign.id });
            }
          }
        }

        await tx.searchCampaign.update({
          where: { id: campaign.id },
          data: {
            progressCurrent: index + 1,
            lastStep: 'Saving and deduplicating leads',
          },
        });
      }

      totalCreditsUsed = calculateSearchCreditsUsed(savedLeadsCount);
      await updateCampaignProgress({
        tx,
        campaignId: campaign.id,
        progressCurrent: normalizedLeads.length,
        progressTotal: normalizedLeads.length,
        lastStep: 'Charging credits',
      });

      await assertCampaignCanComplete({ tx, jobId, campaignId: campaign.id, userId });
      await captureSearchCreditReservation({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          amountUsed: totalCreditsUsed,
          reason: `Ran search campaign: ${campaign.name}`,
          referenceType: 'SearchCampaign',
          referenceId: campaign.id,
          requireActiveReservation: Boolean(jobId),
      });

      await markCampaignCompleted({
        tx,
        campaignId: campaign.id,
        savedLeadsCount,
        creditsUsed: totalCreditsUsed,
        totalProcessed: normalizedLeads.length,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'SEARCH_CAMPAIGN_COMPLETED',
          entityType: 'SearchCampaign',
          entityId: campaign.id,
          metadata: {
            workspaceId: campaign.workspaceId,
            savedLeadsCount,
            creditsUsed: totalCreditsUsed,
          },
        },
      });
    });

    logger.info('campaign.run.completed', { userId, campaignId: campaign.id, savedLeadsCount });
    if (jobId) {
      await markJobCompleted({ jobId, payload: { campaignId: campaign.id, savedLeadsCount } });
    }
    return { success: true, savedLeadsCount, creditsUsed: totalCreditsUsed, jobId };
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const safeMessage = error instanceof AppError ? error.message : 'Campaign failed while running the source adapter.';

    await prisma.$transaction(async (tx) => {
      await releaseSearchCreditReservation({ tx, userId, campaignId: campaign.id });
    }).catch(() => {});
    if (errorCode !== 'JOB_CANCELLED') {
      await markCampaignFailed({ campaignId: campaign.id, errorCode, errorMessage: safeMessage });
      if (jobId) {
        await markJobFailed({ jobId, errorCode, errorMessage: safeMessage }).catch(() => {});
      }
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SEARCH_CAMPAIGN_FAILED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId: campaign.workspaceId,
          errorCode,
        },
      },
    }).catch(() => {});

    logger.warn('campaign.run.failed', { userId, campaignId: campaign.id, errorCode, errorMessage: safeMessage });
    throw error;
  }
};

const runLocalDatasetCampaign = async ({ campaign, userId, jobId, fallbackUsed, platformsRequested, discoveryPlan }) => {
  await markCampaignRunning({
    campaignId: campaign.id,
    userId,
    requestedLimit: campaign.requestedLimit || 20,
    lockedBy: 'local-dataset',
  });
  if (jobId) {
    await markJobRunning({ jobId, workerId: 'inline-local-dataset-worker' });
  }

  const adapter = new LocalDatasetAdapter({
    ...campaign,
    filters: {
      ...(campaign.filters || {}),
      platformsRequested,
    },
  });
  const sourceRequested = platformsRequested.join(',');
  const fallbackReason = fallbackUsed
    ? fallbackReasonFor(campaign.sources || [], campaign.filters?.presenceTargets || [])
    : null;
  assertDiscoveryBudget({
    campaign,
    plannedDiscoveryCalls: 1,
    discoveryMethod: 'LOCAL_DATASET',
  });

  try {
    await assertNotCancelled({ jobId, campaignId: campaign.id });
    await updateCampaignProgress({
      campaignId: campaign.id,
      progressCurrent: 0,
      progressTotal: campaign.requestedLimit || 20,
      lastStep: 'Searching local business index for the selected focus',
    });
    const matchedLeads = await adapter.run();
    await assertNotCancelled({ jobId, campaignId: campaign.id });
    const orchestration = await runDiscoveryOrchestrator({ campaign });
    const evidenceCandidates = orchestration.evidenceCandidates;
    const linkedEvidenceCandidates = orchestration.linkedEvidenceCandidatesRaw;
    const unlinkedEvidenceCandidates = evidenceCandidates.filter((item) => !item.catalogLeadId);
    const openWebEvidence = orchestration.openWebEvidence;
    const evidenceMetadata = {
      evidenceCacheUsed: evidenceCandidates.length > 0,
      evidenceCandidatesCount: evidenceCandidates.length,
      linkedEvidenceCandidatesCount: linkedEvidenceCandidates.length,
      unlinkedEvidenceCandidatesCount: unlinkedEvidenceCandidates.length,
      evidenceSkippedUnlinkedCount: unlinkedEvidenceCandidates.length,
      openWebEvidenceUsed: openWebEvidence.openWebUsed,
      openWebEvidenceCacheHit: openWebEvidence.cacheHits > 0,
      openWebEvidenceCacheHitCount: openWebEvidence.cacheHits,
      openWebEvidenceCandidatesCount: openWebEvidence.results.length,
      openWebEvidenceLinkedCount: openWebEvidence.linkedCandidates.length,
      openWebEvidencePromotableCount: openWebEvidence.promotableCandidates.length,
      openWebEvidenceConfidence: Math.max(0, ...openWebEvidence.results.map((item) => item.result?.confidenceScore || 0)),
      paidCallsAvoidedEstimate: linkedEvidenceCandidates.length,
      openWebEvidenceSkippedReason: openWebEvidence.skippedReason || null,
    };
    const discoveryDecision = {
      ...orchestration.discoveryDecision,
      evidenceCoverage: {
        ...(orchestration.discoveryDecision?.evidenceCoverage || {}),
        savedExternalCallsEstimate: linkedEvidenceCandidates.length,
      },
    };
    const externalDiscovery = {
      candidates: orchestration.externalEvidenceCandidatesRaw,
      metadata: {
        externalDiscoveryUsed: orchestration.externalEvidenceCandidatesRaw.length > 0,
        externalProvider: orchestration.executionSummary.searchMetadataProviderUsed
          || (orchestration.executionSummary.googlePlacesUsed ? 'GOOGLE_PLACES' : null),
        externalDiscoverySkippedReason: orchestration.externalEvidenceCandidatesRaw.length > 0
          ? null
          : ((discoveryDecision.localCoverage?.reason?.includes?.('LOCAL_COVERAGE')
              ? discoveryDecision.localCoverage.reason
              : null)
            || discoveryDecision.searchMetadataPlan?.reason
            || discoveryDecision.googlePlacesPlan?.reason
            || discoveryDecision.primaryReason
            || null),
        searchMetadataProviderPrimary: 'SEARCH_METADATA',
        searchMetadataProviderUsed: orchestration.executionSummary.searchMetadataProviderUsed,
        searchMetadataFallbackUsed: orchestration.executionSummary.searchMetadataSecondaryProviderUsed,
        searchMetadataQueriesUsed: discoveryDecision.searchMetadataPlan?.maxQueriesAllowed || orchestration.queryVariants.length,
        externalCostEstimate: orchestration.layerSummary.reduce((sum, layer) => sum + (layer.costUnits || 0), 0),
      },
    };
    const estimatedTotalResults = Math.min(
      campaign.requestedLimit || 20,
      orchestration.foundCount,
    );
    await updateCampaignProgress({
      campaignId: campaign.id,
      progressCurrent: Math.min(matchedLeads.length + linkedEvidenceCandidates.length, campaign.requestedLimit || 20),
      progressTotal: campaign.requestedLimit || 20,
      lastStep: 'Scoring leads',
    });
    const listNameParts = [
      Array.isArray(campaign.businessTypes) && campaign.businessTypes[0] ? campaign.businessTypes[0] : campaign.query,
      campaign.city,
      'Focus',
    ].filter(Boolean);

    const leadListResult = await prisma.$transaction(async (tx) => {
      await assertCampaignCanComplete({ tx, jobId, campaignId: campaign.id, userId });
      const discoveryQuery = await createDiscoveryQuery({
        tx,
        userId,
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        seedQuery: campaign.query,
        expandedQuery: discoveryPlan?.expandedQuery,
        geography: discoveryPlan?.geography || [campaign.city, campaign.country].filter(Boolean).join(', ') || null,
        targetSources: discoveryPlan?.targetSources || platformsRequested,
        discoveryMethod: 'LOCAL_DATASET',
        adapter: 'LOCAL_DATASET',
        status: 'COMPLETED',
      });
      const createdList = await tx.leadList.create({
        data: {
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          name: listNameParts.join(' - ') || `${campaign.name} - Intelligence`,
          sourceRequested,
          sourceUsed: 'LOCAL_DATASET',
          fallbackUsed,
          searchMode: fallbackUsed ? 'LOCAL_DATASET_FALLBACK' : 'GLOBAL_DATASET',
          filters: {
            country: campaign.country,
            city: campaign.city,
            businessTypes: campaign.businessTypes,
            goal: campaign.filters?.goal || null,
            platformsRequested,
            sourceUsed: 'LOCAL_DATASET',
            fallbackReason,
            discoveryPlan: summarizeDiscoveryPlan(discoveryPlan),
            discovery: {
              sourceUsed: 'LOCAL_DATASET',
              localResultsCount: matchedLeads.length,
              ...evidenceMetadata,
              evidenceSavedExternalCalls: discoveryDecision.evidenceCoverage.savedExternalCallsEstimate,
              discoveryDecision: discoveryDecision.stageDecision,
              discoveryPrimaryReason: discoveryDecision.primaryReason,
              externalDiscoveryUsed: externalDiscovery.metadata.externalDiscoveryUsed,
              externalProvider: externalDiscovery.metadata.externalProvider,
              externalDiscoverySkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
              paidProvidersSkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
              searchMetadataProviderPrimary: externalDiscovery.metadata.searchMetadataProviderPrimary,
              searchMetadataProviderUsed: externalDiscovery.metadata.searchMetadataProviderUsed,
              searchMetadataFallbackUsed: externalDiscovery.metadata.searchMetadataFallbackUsed,
              searchMetadataQueriesUsed: externalDiscovery.metadata.searchMetadataQueriesUsed,
              smartQueryBudget: discoveryDecision.smartQueryBudget,
              searchMetadataMaxQueriesAllowed: discoveryDecision.searchMetadataPlan.maxQueriesAllowed,
              googlePlacesMaxQueriesAllowed: discoveryDecision.googlePlacesPlan.maxQueriesAllowed,
              sourcePolicyWarnings: discoveryDecision.sourcePolicyWarnings,
              externalCostEstimate: externalDiscovery.metadata.externalCostEstimate,
            },
          },
          resultCount: 0,
        },
      });
      await updateCampaignProgress({
        tx,
        campaignId: campaign.id,
        progressCurrent: matchedLeads.length,
        progressTotal: estimatedTotalResults,
        lastStep: 'Saving lead list',
      });

      const combinedLocalAndEvidence = [...matchedLeads, ...linkedEvidenceCandidates].slice(0, campaign.requestedLimit || 20);
      const catalogIds = new Set();
      if (combinedLocalAndEvidence.length > 0) {
        await tx.leadListLead.createMany({
          data: combinedLocalAndEvidence.map((lead, index) => ({
            leadListId: createdList.id,
            catalogLeadId: lead.isReusableEvidence ? lead.catalogLeadId : lead.id,
            rank: index + 1,
            score: lead.opportunityScorePreview || lead.localDatasetScore || null,
            metadata: {
              platformsRequested,
              sourceUsed: lead.isReusableEvidence ? 'LEAD_EVIDENCE_CACHE' : 'LOCAL_DATASET',
              fallbackUsed,
              fallbackReason,
              evidenceId: lead.originalEvidenceId,
            },
          })),
          skipDuplicates: true,
        });
        
        // Only run standard promotion on actual matchedLeads
        matchedLeads.forEach((lead) => catalogIds.add(lead.id));
        await Promise.all(matchedLeads.map((lead) => recordLeadEvidence({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          discoveryQueryId: discoveryQuery.id,
          catalogLeadId: lead.id,
          targetSource: primaryTargetSource(platformsRequested),
          discoveryMethod: 'LOCAL_DATASET',
          sourceType: 'LOCAL_DATASET_RESULT',
          sourceUrl: preferredEvidenceUrl(lead),
          externalId: lead.sourceId || null,
          title: lead.businessName,
          snippet: lead.category || lead.address || null,
          extractedFields: buildEvidenceFields(lead),
          rawMetadata: {
            source: lead.source,
            detectedSignals: lead.detectedSignals,
          },
          confidenceScore: lead.opportunityScorePreview || lead.localDatasetScore || 60,
        })));
      }

      let evidenceCreatedCount = 0;
      let promotedToCatalogCount = 0;
      let linkedDuplicateCount = 0;
      let openWebEvidenceCreatedCount = 0;
      let openWebPromotedToCatalogCount = 0;
      let openWebLinkedDuplicateCount = 0;

      if (openWebEvidence.promotableCandidates.length > 0) {
        const openWebDiscoveryQuery = await createDiscoveryQuery({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          seedQuery: campaign.query,
          expandedQuery: discoveryPlan?.expandedQuery,
          geography: discoveryPlan?.geography || [campaign.city, campaign.country].filter(Boolean).join(', ') || null,
          targetSources: ['WEBSITE'],
          discoveryMethod: 'OPEN_WEB_EVIDENCE',
          adapter: 'OPEN_WEB_EVIDENCE',
          costUnits: 0,
          status: 'COMPLETED',
        });

        const openWebEvidences = [];
        for (const candidate of openWebEvidence.promotableCandidates) {
          openWebEvidences.push(await recordLeadEvidence({
            tx,
            userId,
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            discoveryQueryId: openWebDiscoveryQuery.id,
            ...candidate,
          }));
        }
        openWebEvidenceCreatedCount = openWebEvidences.length;

        const promotionResults = await promoteHighConfidenceEvidenceBatch({
          tx,
          evidences: openWebEvidences,
          campaign,
          limit: Math.min(openWebEvidences.length, campaign.requestedLimit || 20),
        });

        let rank = matchedLeads.length + linkedEvidenceCandidates.length + 1;
        for (const promotion of promotionResults) {
          if (!promotion.catalogLead?.id || catalogIds.has(promotion.catalogLead.id)) continue;
          catalogIds.add(promotion.catalogLead.id);
          if (promotion.status === 'PROMOTED') openWebPromotedToCatalogCount += 1;
          if (promotion.status === 'LINKED_DUPLICATE') openWebLinkedDuplicateCount += 1;
          await tx.leadListLead.create({
            data: {
              leadListId: createdList.id,
              catalogLeadId: promotion.catalogLead.id,
              rank,
              score: promotion.catalogLead.localDatasetScore || promotion.catalogLead.confidenceScore || null,
              metadata: {
                platformsRequested,
                sourceUsed: 'OPEN_WEB_EVIDENCE',
                openWebEvidenceUsed: true,
              },
            },
          }).catch(() => {});
          rank += 1;
          if (catalogIds.size >= (campaign.requestedLimit || 20)) break;
        }
      }

      if (externalDiscovery.candidates.length > 0) {
        const externalDiscoveryQuery = await createDiscoveryQuery({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          seedQuery: campaign.query,
          expandedQuery: discoveryPlan?.expandedQuery,
          geography: discoveryPlan?.geography || [campaign.city, campaign.country].filter(Boolean).join(', ') || null,
          targetSources: discoveryPlan?.targetSources || platformsRequested,
          discoveryMethod: externalDiscovery.metadata.externalProvider === 'GOOGLE_PLACES' ? 'GOOGLE_PLACES' : 'SERPAPI_DISCOVERY',
          adapter: externalDiscovery.metadata.externalProvider || 'EXTERNAL_DISCOVERY',
          costUnits: externalDiscovery.metadata.externalCostEstimate || 0,
          status: 'COMPLETED',
        });

        const evidences = [];
        for (const candidate of externalDiscovery.candidates) {
          evidences.push(await recordLeadEvidence({
            tx,
            userId,
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            discoveryQueryId: externalDiscoveryQuery.id,
            ...candidate,
          }));
        }
        evidenceCreatedCount = externalDiscovery.candidates.length;

        const promotionResults = await promoteHighConfidenceEvidenceBatch({
          tx,
          evidences,
          campaign,
          limit: Math.min(evidences.length, campaign.requestedLimit || 20),
        });

        let rank = matchedLeads.length + linkedEvidenceCandidates.length + 1;
        for (const promotion of promotionResults) {
          if (!promotion.catalogLead?.id || catalogIds.has(promotion.catalogLead.id)) continue;
          catalogIds.add(promotion.catalogLead.id);
          if (promotion.status === 'PROMOTED') promotedToCatalogCount++;
          if (promotion.status === 'LINKED_DUPLICATE') linkedDuplicateCount++;
          await tx.leadListLead.create({
            data: {
              leadListId: createdList.id,
              catalogLeadId: promotion.catalogLead.id,
              rank,
              score: promotion.catalogLead.localDatasetScore || promotion.catalogLead.confidenceScore || null,
              metadata: {
                platformsRequested,
                sourceUsed: promotion.catalogLead.source || 'SERPAPI',
                externalDiscoveryUsed: true,
                externalProvider: externalDiscovery.metadata.externalProvider,
              },
            },
          }).catch(() => {});
          rank += 1;
          if (catalogIds.size >= (campaign.requestedLimit || 20)) break;
        }
      }

      const finalResultCount = catalogIds.size;
      const layerSummary = orchestration.layerSummary;
      const message = orchestration.shortfallReason
        || buildLayeredSearchMessage({
          resultCount: finalResultCount,
          layerSummary,
        });
      const creditsUsed = calculateSearchCreditsUsed(finalResultCount);
      const shortfallCount = Math.max(0, (campaign.requestedLimit || 20) - finalResultCount);

      await tx.leadList.update({
        where: { id: createdList.id },
        data: {
          resultCount: finalResultCount,
          filters: {
            ...createdList.filters,
            discovery: {
              ...createdList.filters.discovery,
              evidenceCreatedCount,
              promotedToCatalogCount,
              linkedDuplicateCount,
              openWebEvidenceCreatedCount,
              openWebPromotedToCatalogCount,
              openWebLinkedDuplicateCount,
              ...evidenceMetadata,
              evidenceSavedExternalCalls: discoveryDecision.evidenceCoverage.savedExternalCallsEstimate,
              paidProvidersSkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
              smartQueryBudget: discoveryDecision.smartQueryBudget,
              searchMetadataMaxQueriesAllowed: discoveryDecision.searchMetadataPlan.maxQueriesAllowed,
              googlePlacesMaxQueriesAllowed: discoveryDecision.googlePlacesPlan.maxQueriesAllowed,
              requestedLimit: campaign.requestedLimit || 20,
              finalResultCount,
              acceptedCount: finalResultCount,
              foundCount: orchestration.foundCount,
              shortfallCount,
              shortfallReason: shortfallCount > 0 ? message : null,
              providerBreakdown: orchestration.providerBreakdown,
              queryVariants: orchestration.queryVariants,
              layerReport: layerSummary,
              message,
            },
          },
        },
      });

      await tx.searchCampaign.update({
        where: { id: campaign.id },
        data: {
          filters: {
            ...(campaign.filters || {}),
            presenceTargets: campaign.filters?.presenceTargets || [],
            discoveryLayerReport: layerSummary,
            discoveryMessage: message,
            discoveryProviderBreakdown: orchestration.providerBreakdown,
            requestedLimit: campaign.requestedLimit || 20,
            acceptedCount: finalResultCount,
            foundCount: orchestration.foundCount,
            shortfallCount,
          },
        },
      });

      await assertCampaignCanComplete({ tx, jobId, campaignId: campaign.id, userId });
      await captureSearchCreditReservation({
          tx,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          amountUsed: creditsUsed,
          reason: `Ran search campaign: ${campaign.name}`,
          referenceType: 'SearchCampaign',
          referenceId: campaign.id,
          requireActiveReservation: Boolean(jobId),
      });
      await updateCampaignProgress({
        tx,
        campaignId: campaign.id,
        progressCurrent: finalResultCount,
        progressTotal: finalResultCount,
        lastStep: 'Charging credits',
      });

      await markCampaignCompleted({
        tx,
        campaignId: campaign.id,
        savedLeadsCount: finalResultCount,
        creditsUsed,
        totalProcessed: finalResultCount,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: fallbackUsed ? 'SEARCH_CAMPAIGN_LOCAL_DATASET_FALLBACK' : 'SEARCH_CAMPAIGN_LOCAL_DATASET_RUN',
          entityType: 'SearchCampaign',
          entityId: campaign.id,
          metadata: {
            workspaceId: campaign.workspaceId,
            platformsRequested,
            sourceUsed: 'LOCAL_DATASET',
            fallbackUsed,
            fallbackReason,
            leadListId: createdList.id,
            leadsReturned: finalResultCount,
            creditsUsed,
            providerBreakdown: orchestration.providerBreakdown,
            requestedLimit: campaign.requestedLimit || 20,
            localResultsCount: matchedLeads.length,
            ...evidenceMetadata,
            evidenceSavedExternalCalls: discoveryDecision.evidenceCoverage.savedExternalCallsEstimate,
            discoveryPrimaryReason: discoveryDecision.primaryReason,
            paidProvidersSkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
            openWebEvidenceCreatedCount,
            openWebPromotedToCatalogCount,
            openWebLinkedDuplicateCount,
            smartQueryBudget: discoveryDecision.smartQueryBudget,
            externalDiscoveryUsed: externalDiscovery.metadata.externalDiscoveryUsed,
            externalProvider: externalDiscovery.metadata.externalProvider,
            externalDiscoverySkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
            searchMetadataProviderPrimary: externalDiscovery.metadata.searchMetadataProviderPrimary,
            searchMetadataProviderUsed: externalDiscovery.metadata.searchMetadataProviderUsed,
            searchMetadataFallbackUsed: externalDiscovery.metadata.searchMetadataFallbackUsed,
            searchMetadataQueriesUsed: externalDiscovery.metadata.searchMetadataQueriesUsed,
            evidenceCreatedCount,
            promotedToCatalogCount,
            externalCostEstimate: externalDiscovery.metadata.externalCostEstimate,
          },
        },
      });

      return {
        leadList: createdList,
        leadsReturned: finalResultCount,
        creditsUsed,
        evidenceCreatedCount: evidenceCreatedCount + openWebEvidenceCreatedCount,
        promotedToCatalogCount: promotedToCatalogCount + openWebPromotedToCatalogCount,
        layerSummary,
        message,
      };
    });

    if (jobId) {
      await markJobCompleted({
        jobId,
        payload: {
          campaignId: campaign.id,
          leadListId: leadListResult.leadList.id,
          leadsReturned: leadListResult.leadsReturned,
          creditsUsed: leadListResult.creditsUsed,
        },
      });
    }

    logger.info('campaign.local_dataset.completed', {
      userId,
      campaignId: campaign.id,
      platformsRequested,
      fallbackUsed,
      leadsReturned: leadListResult.leadsReturned,
      creditsUsed: leadListResult.creditsUsed,
    });

    return {
      success: true,
      campaignId: campaign.id,
      leadListId: leadListResult.leadList.id,
      platformsRequested,
      leadsReturned: leadListResult.leadsReturned,
      resultCount: leadListResult.leadsReturned,
      creditsUsed: leadListResult.creditsUsed,
      sourceUsed: 'LOCAL_DATASET',
      requestedLimit: campaign.requestedLimit || 20,
      foundCount: orchestration.foundCount,
      acceptedCount: leadListResult.leadsReturned,
      shortfallCount: Math.max(0, (campaign.requestedLimit || 20) - leadListResult.leadsReturned),
      localResultsCount: matchedLeads.length,
      openWebEvidenceUsed: openWebEvidence.openWebUsed,
      openWebEvidenceCandidatesCount: openWebEvidence.results.length,
      openWebEvidenceCacheHitCount: openWebEvidence.cacheHits,
      externalDiscoveryUsed: externalDiscovery.metadata.externalDiscoveryUsed,
      externalProvider: externalDiscovery.metadata.externalProvider,
      externalDiscoverySkippedReason: externalDiscovery.metadata.externalDiscoverySkippedReason,
      searchMetadataProviderPrimary: externalDiscovery.metadata.searchMetadataProviderPrimary,
      searchMetadataProviderUsed: externalDiscovery.metadata.searchMetadataProviderUsed,
      searchMetadataFallbackUsed: externalDiscovery.metadata.searchMetadataFallbackUsed,
      searchMetadataQueriesUsed: externalDiscovery.metadata.searchMetadataQueriesUsed,
      evidenceCreatedCount: leadListResult.evidenceCreatedCount,
      promotedToCatalogCount: leadListResult.promotedToCatalogCount,
      externalCostEstimate: externalDiscovery.metadata.externalCostEstimate,
      providerBreakdown: orchestration.providerBreakdown,
      queryVariants: orchestration.queryVariants,
      layerSummary: leadListResult.layerSummary,
      message: leadListResult.message,
      jobId,
    };
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const safeMessage = error instanceof AppError ? error.message : 'Campaign failed while searching available sources.';

    await prisma.$transaction(async (tx) => {
      await releaseSearchCreditReservation({
        tx,
        userId,
        campaignId: campaign.id,
        status: errorCode === 'JOB_CANCELLED' ? 'CANCELLED' : 'RELEASED',
      });
    }).catch(() => {});
    if (errorCode !== 'JOB_CANCELLED') {
      await markCampaignFailed({ campaignId: campaign.id, errorCode, errorMessage: safeMessage }).catch(() => {});
      if (jobId) {
        await markJobFailed({ jobId, errorCode, errorMessage: safeMessage }).catch(() => {});
      }
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SEARCH_CAMPAIGN_FAILED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId: campaign.workspaceId,
          errorCode,
          sourceUsed: 'LOCAL_DATASET',
          fallbackUsed,
          fallbackReason,
        },
      },
    }).catch(() => {});

    logger.warn('campaign.local_dataset.failed', { userId, campaignId: campaign.id, errorCode, errorMessage: safeMessage });
    throw error;
  }
};

export const estimateCampaignCost = ({ requestedLimit = 20, sources = [], enrichment: _enrichment = false, analysis = false } = {}) => {
  const limit = Math.max(1, Math.min(requestedLimit, 100));
  const sourceBreakdown = sources
    .map((source) => ({ source, estimate: estimateSourceCost(source, { maxResults: limit }) }))
    .filter((item) => item.estimate);
  const baseSearchCost = SEARCH_BASE_CREDITS;
  const perLeadCost = SEARCH_PER_RETURNED_LEAD_CREDITS;
  const enrichmentCost = 0;
  const analysisCost = analysis ? limit : 0;
  const estimatedMax = baseSearchCost + (limit * perLeadCost) + enrichmentCost + analysisCost;

  return {
    baseCost: baseSearchCost,
    baseSearchCost,
    perLeadCost,
    enrichmentCost,
    analysisCost,
    requestedLimit: limit,
    estimatedMax,
    estimatedTotal: estimatedMax,
    breakdown: {
      sources: sourceBreakdown,
      search: baseSearchCost + (limit * perLeadCost),
      enrichment: enrichmentCost,
      analysis: analysisCost,
    },
    warnings: sourceBreakdown.flatMap((item) => item.estimate.warnings || []),
  };
};

const defaultAnalysisProfile = {
  serviceType: 'Digital Presence Improvement',
};

export const analyzeLead = async ({ leadId, userId }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId },
    include: {
      campaign: { include: { serviceProfile: true } },
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!lead) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);
  }

  if (lead.analyses.length > 0) {
    return { analysis: lead.analyses[0], reused: true, creditsUsed: 0 };
  }

  const profile = lead.campaign?.serviceProfile || defaultAnalysisProfile;

  const result = await prisma.$transaction(async (tx) => {
    await deductCredits({
      tx,
      userId,
      workspaceId: lead.workspaceId,
      amount: 1,
      type: 'CREDIT_USED',
      reason: `Analyzed lead: ${lead.businessName}`,
      referenceType: 'Lead',
      referenceId: lead.id,
    });

    const analysis = await runRuleBasedAnalysis({
      tx,
      lead,
      profile,
      userId,
      workspaceId: lead.workspaceId,
      campaignId: lead.campaignId,
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'LEAD_ANALYZED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: {
          workspaceId: lead.workspaceId,
          analysisId: analysis.id,
          creditsUsed: 1,
        },
      },
    });

    return analysis;
  });

  return { analysis: result, reused: false, creditsUsed: 1 };
};

export const analyzeCampaign = async ({ campaignId, userId }) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { serviceProfile: true },
  });

  if (!campaign) {
    throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);
  }

  const [leads, leadListItems] = await Promise.all([
    prisma.lead.findMany({
      where: {
        campaignId,
        userId,
        analyses: { none: {} },
      },
      take: 100,
    }),
    prisma.leadListLead.findMany({
      where: {
        leadList: {
          campaignId,
          userId,
        },
        analyses: { none: {} },
      },
      include: {
        lead: true,
        catalogLead: true,
      },
      take: 100,
    }),
  ]);

  const directLeadIds = new Set(leads.map((lead) => lead.id));
  const analyzableListItems = leadListItems.filter((item) => {
    const sourceLead = item.lead || item.catalogLead;
    if (!sourceLead) return false;
    return !item.leadId || !directLeadIds.has(item.leadId);
  });
  const analysisCount = leads.length + analyzableListItems.length;

  if (analysisCount === 0) {
    return { analyzedCount: 0, creditsUsed: 0 };
  }

  const profile = campaign.serviceProfile || defaultAnalysisProfile;

  const result = await prisma.$transaction(async (tx) => {
    await deductCredits({
      tx,
      userId,
      workspaceId: campaign.workspaceId,
      amount: analysisCount,
      type: 'CREDIT_USED',
      reason: `Analyzed campaign leads: ${campaign.name}`,
      referenceType: 'SearchCampaign',
      referenceId: campaign.id,
    });

    const analyses = [];
    for (const lead of leads) {
      analyses.push(await runRuleBasedAnalysis({
        tx,
        lead,
        profile,
        userId,
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
      }));
    }

    for (const item of analyzableListItems) {
      const sourceLead = item.lead || item.catalogLead;
      const analysis = await runRuleBasedAnalysis({
        tx,
        lead: sourceLead,
        profile,
        userId,
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        leadListLeadId: item.id,
      });

      await tx.leadListLead.update({
        where: { id: item.id },
        data: {
          analysisStatus: 'COMPLETED',
          analyzedAt: new Date(),
          score: analysis.opportunityScore,
        },
      });

      analyses.push(analysis);
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: 'SEARCH_CAMPAIGN_ANALYZED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId: campaign.workspaceId,
          analyzedCount: analyses.length,
          creditsUsed: analysisCount,
        },
      },
    });

    return analyses;
  });

  return { analyzedCount: result.length, creditsUsed: analysisCount };
};
