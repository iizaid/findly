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

const LOCAL_DATASET_SOURCES = ['LOCAL_DATASET', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'DATASET_IMPORT', 'MANUAL_ADMIN'];
const LOCAL_FALLBACK_SOURCE_KEYS = ['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP', 'SERPAPI', 'TRIPADVISOR', 'YOUTUBE', 'X', 'LINKEDIN', 'TIKTOK'];

const fallbackReasonFor = (sources = []) => {
  if (sources.includes('GOOGLE_MAPS')) return 'GOOGLE_MAPS_NOT_CONNECTED';
  if (sources.includes('INSTAGRAM')) return 'INSTAGRAM_API_NOT_CONNECTED';
  if (sources.includes('FACEBOOK')) return 'FACEBOOK_API_NOT_CONNECTED';
  if (sources.includes('REDDIT')) return 'REDDIT_API_NOT_CONNECTED';
  if (sources.includes('YELP')) return 'YELP_API_NOT_CONNECTED';
  if (sources.includes('SERPAPI')) return 'SERPAPI_NOT_CONNECTED';
  if (sources.includes('WEBSITE')) return 'WEBSITE_ENRICHMENT_SEARCH_NOT_CONNECTED';
  return 'PROVIDERS_NOT_CONNECTED';
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

  const sources = campaign.sources || [];
  if (sources.length === 0) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Campaign requires at least one source.', 400);
  }

  const localDatasetRequested = sources.some((source) => LOCAL_DATASET_SOURCES.includes(source));
  const externalSourceKeys = sources.filter((source) => !LOCAL_DATASET_SOURCES.includes(source));
  const runnableSources = externalSourceKeys.map((source) => ({ source, ...getRunnableAdapter(source) }));
  const runnableExternalSources = runnableSources.filter((source) => source.runnable);
  const unavailable = runnableSources.find((source) => !source.runnable);

  const fallbackSourcesRequested = externalSourceKeys.some((source) => LOCAL_FALLBACK_SOURCE_KEYS.includes(source));
  const allUnavailableSourcesCanFallback = externalSourceKeys.length > 0
    && externalSourceKeys.every((source) => LOCAL_FALLBACK_SOURCE_KEYS.includes(source));
  const shouldUseLocalDataset = localDatasetRequested
    || (fallbackSourcesRequested && runnableExternalSources.length === 0 && allUnavailableSourcesCanFallback);

  if (shouldUseLocalDataset) {
    if (!await hasActiveSearchReservation({ userId, campaignId: campaign.id })) {
      await assertSearchCreditsAvailable({ userId, requestedLimit: campaign.requestedLimit || 20 });
    }
    return runLocalDatasetCampaign({
      campaign,
      userId,
      jobId,
      fallbackUsed: !localDatasetRequested,
      platformsRequested: sources,
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
      const adapter = new source.Adapter(campaign);
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

const runLocalDatasetCampaign = async ({ campaign, userId, jobId, fallbackUsed, platformsRequested }) => {
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
  const fallbackReason = fallbackUsed ? fallbackReasonFor(platformsRequested) : null;

  try {
    await assertNotCancelled({ jobId, campaignId: campaign.id });
    await updateCampaignProgress({
      campaignId: campaign.id,
      progressCurrent: 0,
      progressTotal: campaign.requestedLimit || 20,
      lastStep: 'Searching selected platforms',
    });
    const matchedLeads = await adapter.run();
    await assertNotCancelled({ jobId, campaignId: campaign.id });
    const leadsReturned = matchedLeads.length;
    await updateCampaignProgress({
      campaignId: campaign.id,
      progressCurrent: Math.min(leadsReturned, campaign.requestedLimit || 20),
      progressTotal: campaign.requestedLimit || 20,
      lastStep: 'Scoring leads',
    });
    const creditsUsed = calculateSearchCreditsUsed(leadsReturned);
    const message = leadsReturned > 0
      ? 'Search completed across selected platforms.'
      : 'No matching leads found. Try broader filters, a different location, or fewer platform constraints.';

    const listNameParts = [
      Array.isArray(campaign.businessTypes) && campaign.businessTypes[0] ? campaign.businessTypes[0] : campaign.query,
      campaign.city,
      'Platform Signals',
    ].filter(Boolean);

    const leadList = await prisma.$transaction(async (tx) => {
      await assertCampaignCanComplete({ tx, jobId, campaignId: campaign.id, userId });
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
          },
          resultCount: leadsReturned,
        },
      });
      await updateCampaignProgress({
        tx,
        campaignId: campaign.id,
        progressCurrent: leadsReturned,
        progressTotal: leadsReturned,
        lastStep: 'Saving lead list',
      });

      if (matchedLeads.length > 0) {
        await tx.leadListLead.createMany({
          data: matchedLeads.map((lead, index) => ({
            leadListId: createdList.id,
            catalogLeadId: lead.id,
            rank: index + 1,
            score: lead.localDatasetScore || null,
            metadata: {
              platformsRequested,
              sourceUsed: 'LOCAL_DATASET',
              fallbackUsed,
              fallbackReason,
            },
          })),
          skipDuplicates: true,
        });
      }

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
        progressCurrent: leadsReturned,
        progressTotal: leadsReturned,
        lastStep: 'Charging credits',
      });

      await markCampaignCompleted({
        tx,
        campaignId: campaign.id,
        savedLeadsCount: leadsReturned,
        creditsUsed,
        totalProcessed: leadsReturned,
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
            leadsReturned,
            creditsUsed,
          },
        },
      });

      return createdList;
    });

    if (jobId) {
      await markJobCompleted({
        jobId,
        payload: {
          campaignId: campaign.id,
          leadListId: leadList.id,
          leadsReturned,
          creditsUsed,
        },
      });
    }

    logger.info('campaign.local_dataset.completed', {
      userId,
      campaignId: campaign.id,
      platformsRequested,
      fallbackUsed,
      leadsReturned,
      creditsUsed,
    });

    return {
      success: true,
      campaignId: campaign.id,
      leadListId: leadList.id,
      platformsRequested,
      leadsReturned,
      resultCount: leadsReturned,
      creditsUsed,
      message,
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

export const estimateCampaignCost = ({ requestedLimit = 20, sources = [], enrichment = false, analysis = false } = {}) => {
  const limit = Math.max(1, Math.min(requestedLimit, 100));
  const sourceBreakdown = sources
    .map((source) => ({ source, estimate: estimateSourceCost(source, { maxResults: limit }) }))
    .filter((item) => item.estimate);
  const baseSearchCost = SEARCH_BASE_CREDITS;
  const perLeadCost = SEARCH_PER_RETURNED_LEAD_CREDITS;
  const enrichmentCost = enrichment ? 0 : 0;
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
