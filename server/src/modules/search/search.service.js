import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import {
  ANALYSIS_CREDITS,
  calculateSearchCreditCost,
  deductCredits,
  estimateSearchCreditReservation,
  refundCredits,
  reserveCredits,
  SEARCH_BASE_CREDITS,
  SEARCH_PER_RETURNED_LEAD_CREDITS,
  WEBSITE_ENRICHMENT_CREDITS,
} from '../credits/credit.service.js';
import { runRuleBasedAnalysis } from './analysis.service.js';
import { estimateSourceCost, getRunnableAdapter } from './source.registry.js';
import { logger } from '../../utils/logger.js';
import { findDuplicateLead } from './leadDeduplication.js';
import { markCampaignCompleted, markCampaignFailed, markCampaignRunning, RUNNABLE_CAMPAIGN_STATUSES } from './campaignJob.service.js';
import { markJobCompleted, markJobFailed, markJobRunning } from '../jobs/jobQueue.service.js';
import { LocalDatasetAdapter } from './adapters/LocalDatasetAdapter.js';

const LOCAL_DATASET_SOURCES = ['LOCAL_DATASET', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'DATASET_IMPORT'];
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

const safeLeadPreview = (lead) => ({
  id: lead.id,
  businessName: lead.businessName,
  category: lead.category,
  country: lead.country,
  city: lead.city,
  websiteUrl: lead.websiteUrl,
  instagramUrl: lead.instagramUrl,
  phone: lead.phone,
  source: lead.source,
  sourceFile: lead.sourceFile,
  localDatasetScore: lead.localDatasetScore,
});

const reserveCampaignCredits = async ({ userId, workspaceId, campaignId, requestedLimit, reason }) => {
  const reservedCredits = estimateSearchCreditReservation({ requestedLimit });

  await reserveCredits({
    userId,
    workspaceId,
    amount: reservedCredits,
    reason,
    referenceType: 'SearchCampaign',
    referenceId: campaignId,
  });

  await prisma.searchCampaign.update({
    where: { id: campaignId },
    data: { creditsReserved: reservedCredits },
  });

  return reservedCredits;
};

const refundUnusedReservation = async ({ tx = prisma, userId, workspaceId, campaignId, reservedCredits, actualCreditsUsed, reason }) => {
  const refundAmount = reservedCredits - actualCreditsUsed;
  if (refundAmount <= 0) return null;

  return refundCredits({
    tx,
    userId,
    workspaceId,
    amount: refundAmount,
    reason,
    referenceType: 'SearchCampaign',
    referenceId: campaignId,
  });
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
  const runnableSources = sources.map((source) => ({ source, ...getRunnableAdapter(source) }));
  const unavailable = runnableSources.find((source) => !source.runnable);

  const fallbackSourcesRequested = sources.some((source) => LOCAL_FALLBACK_SOURCE_KEYS.includes(source));
  const shouldUseLocalDataset = localDatasetRequested || (fallbackSourcesRequested && unavailable);

  if (shouldUseLocalDataset) {
    return runLocalDatasetCampaign({
      campaign,
      userId,
      jobId,
      fallbackUsed: !localDatasetRequested,
      platformsRequested: sources,
    });
  }

  if (unavailable) {
    const message = unavailable.status?.reason || `${unavailable.source} is not available.`;
    const code = unavailable.status?.status === 'not_configured' ? errorCodes.SOURCE_NOT_CONFIGURED : errorCodes.SOURCE_UNAVAILABLE;
    throw new AppError(code, message, 400);
  }

  const reservedCredits = await reserveCampaignCredits({
    userId,
    workspaceId: campaign.workspaceId,
    campaignId: campaign.id,
    requestedLimit: campaign.requestedLimit || 20,
    reason: `Reserved credits for search campaign: ${campaign.name}`,
  });
  let reservationOpen = true;

  try {
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

    const normalizedLeadGroups = [];
    for (const source of runnableSources) {
      await prisma.searchCampaign.update({
        where: { id: campaign.id },
        data: { lastStep: `Searching ${source.status.label}` },
      });
      const adapter = new source.Adapter(campaign);
      normalizedLeadGroups.push(...await adapter.run());
    }

    const normalizedLeads = normalizedLeadGroups.slice(0, campaign.requestedLimit || 20);
    let savedLeadsCount = 0;

    await prisma.$transaction(async (tx) => {
      const leadList = await tx.leadList.create({
        data: {
          name: `${campaign.name} - Results`,
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
        },
      });

      for (const [index, lead] of normalizedLeads.entries()) {
        const existing = await findDuplicateLead({
          tx,
          workspaceId: campaign.workspaceId,
          lead,
        });

        if (!existing) {
          await tx.lead.create({
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
          savedLeadsCount += 1;
        }

        await tx.searchCampaign.update({
          where: { id: campaign.id },
          data: {
            progressCurrent: index + 1,
            lastStep: 'Saving and deduplicating leads',
          },
        });
      }

      const totalCreditsUsed = calculateSearchCreditCost({ returnedLeadsCount: savedLeadsCount });
      await refundUnusedReservation({
        tx,
        userId,
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        reservedCredits,
        actualCreditsUsed: totalCreditsUsed,
        reason: `Refunded unused reserved credits for search campaign: ${campaign.name}`,
      });
      reservationOpen = false;

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
            creditsReserved: reservedCredits,
            creditsUsed: totalCreditsUsed,
            analysisIncluded: false,
          },
        },
      });
    });

    logger.info('campaign.run.completed', { userId, campaignId: campaign.id, savedLeadsCount });
    if (jobId) {
      await markJobCompleted({ jobId, payload: { campaignId: campaign.id, savedLeadsCount } });
    }
    return { success: true, savedLeadsCount, creditsReserved: reservedCredits, creditsUsed: calculateSearchCreditCost({ returnedLeadsCount: savedLeadsCount }), jobId };
  } catch (error) {
    if (reservationOpen) {
      await refundCredits({
        userId,
        workspaceId: campaign.workspaceId,
        amount: reservedCredits,
        reason: `Refunded reserved credits after failed search campaign: ${campaign.name}`,
        referenceType: 'SearchCampaign',
        referenceId: campaign.id,
      }).catch(() => {});
    }

    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const safeMessage = error instanceof AppError ? error.message : 'Campaign failed while running the source adapter.';

    await markCampaignFailed({ campaignId: campaign.id, errorCode, errorMessage: safeMessage }).catch(() => {});
    if (jobId) {
      await markJobFailed({ jobId, errorCode, errorMessage: safeMessage }).catch(() => {});
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
          creditsRefunded: reservationOpen ? reservedCredits : 0,
        },
      },
    }).catch(() => {});

    logger.warn('campaign.run.failed', { userId, campaignId: campaign.id, errorCode, errorMessage: safeMessage });
    throw error;
  }
};

const runLocalDatasetCampaign = async ({ campaign, userId, jobId, fallbackUsed, platformsRequested }) => {
  const reservedCredits = await reserveCampaignCredits({
    userId,
    workspaceId: campaign.workspaceId,
    campaignId: campaign.id,
    requestedLimit: campaign.requestedLimit || 20,
    reason: `Reserved credits for intelligence search campaign: ${campaign.name}`,
  });
  let reservationOpen = true;

  try {
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
    const matchedLeads = await adapter.run();
    const leadsReturned = matchedLeads.length;
    const actualCreditsUsed = calculateSearchCreditCost({ returnedLeadsCount: leadsReturned });
    const sourceRequested = platformsRequested.join(',');
    const fallbackReason = fallbackUsed ? fallbackReasonFor(platformsRequested) : null;
    const message = leadsReturned > 0
      ? 'Search completed across Findly Intelligence Index.'
      : 'No matching leads found. A base search cost was charged for running the intelligence query.';

    const listNameParts = [
      Array.isArray(campaign.businessTypes) && campaign.businessTypes[0] ? campaign.businessTypes[0] : campaign.query,
      campaign.city,
      'Findly Intelligence',
    ].filter(Boolean);

    const leadList = await prisma.$transaction(async (tx) => {
      const createdList = await tx.leadList.create({
        data: {
          userId,
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          name: listNameParts.join(' - ') || `${campaign.name} - Intelligence`,
          sourceRequested,
          sourceUsed: 'LOCAL_DATASET',
          fallbackUsed,
          searchMode: fallbackUsed ? 'FINDLY_INTELLIGENCE_FALLBACK' : 'FINDLY_INTELLIGENCE_INDEX',
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
              sourceMode: 'FINDLY_INTELLIGENCE_INDEX',
              fallbackUsed,
              fallbackReason,
            },
          })),
          skipDuplicates: true,
        });
      }

      await refundUnusedReservation({
        tx,
        userId,
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        reservedCredits,
        actualCreditsUsed,
        reason: `Refunded unused reserved credits for intelligence search campaign: ${campaign.name}`,
      });
      reservationOpen = false;

      await markCampaignCompleted({
        tx,
        campaignId: campaign.id,
        savedLeadsCount: leadsReturned,
        creditsUsed: actualCreditsUsed,
        totalProcessed: leadsReturned,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: fallbackUsed ? 'SEARCH_CAMPAIGN_FINDLY_INTELLIGENCE_FALLBACK' : 'SEARCH_CAMPAIGN_FINDLY_INTELLIGENCE_RUN',
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
            creditsReserved: reservedCredits,
            creditsUsed: actualCreditsUsed,
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
          platformsRequested,
          sourceUsed: 'LOCAL_DATASET',
          sourceMode: 'FINDLY_INTELLIGENCE_INDEX',
          fallbackUsed,
          fallbackReason,
          leadListId: leadList.id,
          leadsReturned,
          creditsUsed: actualCreditsUsed,
        },
      });
    }

    logger.info('campaign.local_dataset.completed', {
      userId,
      campaignId: campaign.id,
      platformsRequested,
      fallbackUsed,
      leadsReturned,
      creditsUsed: actualCreditsUsed,
    });

    return {
      success: true,
      campaignId: campaign.id,
      leadListId: leadList.id,
      sourceRequested,
      platformsRequested,
      sourceMode: 'FINDLY_INTELLIGENCE_INDEX',
      sourceUsed: 'LOCAL_DATASET',
      fallbackUsed,
      fallbackReason,
      searchMode: fallbackUsed ? 'FINDLY_INTELLIGENCE_FALLBACK' : 'FINDLY_INTELLIGENCE_INDEX',
      leadsFound: leadsReturned,
      leadsReturned,
      resultCount: leadsReturned,
      creditsReserved: reservedCredits,
      creditsUsed: actualCreditsUsed,
      warning: fallbackUsed ? 'Findly used its Intelligence Index because the selected live provider is not connected yet.' : null,
      message,
      matchedLeads: matchedLeads.map(safeLeadPreview),
      jobId,
    };
  } catch (error) {
    if (reservationOpen) {
      await refundCredits({
        userId,
        workspaceId: campaign.workspaceId,
        amount: reservedCredits,
        reason: `Refunded reserved credits after failed intelligence search campaign: ${campaign.name}`,
        referenceType: 'SearchCampaign',
        referenceId: campaign.id,
      }).catch(() => {});
    }

    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const safeMessage = error instanceof AppError ? error.message : 'Campaign failed while running Findly Intelligence Index.';
    await markCampaignFailed({ campaignId: campaign.id, errorCode, errorMessage: safeMessage }).catch(() => {});
    if (jobId) {
      await markJobFailed({ jobId, errorCode, errorMessage: safeMessage }).catch(() => {});
    }
    throw error;
  }
};

export const estimateCampaignCost = ({ requestedLimit = 20, sources = [], enrichment = false, analysis = false } = {}) => {
  const limit = Math.max(1, Math.min(Number(requestedLimit) || 20, 100));
  const sourceBreakdown = sources
    .map((source) => ({ source, estimate: estimateSourceCost(source, { maxResults: limit }) }))
    .filter((item) => item.estimate);
  const baseSearchCost = SEARCH_BASE_CREDITS;
  const perLeadCost = SEARCH_PER_RETURNED_LEAD_CREDITS;
  const enrichmentCost = enrichment ? WEBSITE_ENRICHMENT_CREDITS : 0;
  const analysisCost = analysis ? limit * ANALYSIS_CREDITS : 0;
  const estimatedMax = estimateSearchCreditReservation({ requestedLimit: limit }) + enrichmentCost + analysisCost;

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
      search: estimateSearchCreditReservation({ requestedLimit: limit }),
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
      amount: ANALYSIS_CREDITS,
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
          creditsUsed: ANALYSIS_CREDITS,
        },
      },
    });

    return analysis;
  });

  return { analysis: result, reused: false, creditsUsed: ANALYSIS_CREDITS };
};

export const analyzeCampaign = async ({ campaignId, userId }) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { serviceProfile: true },
  });

  if (!campaign) {
    throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);
  }

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      userId,
      analyses: { none: {} },
    },
    take: 100,
  });

  if (leads.length === 0) {
    return { analyzedCount: 0, creditsUsed: 0 };
  }

  const profile = campaign.serviceProfile || defaultAnalysisProfile;
  const creditsToUse = leads.length * ANALYSIS_CREDITS;

  const result = await prisma.$transaction(async (tx) => {
    await deductCredits({
      tx,
      userId,
      workspaceId: campaign.workspaceId,
      amount: creditsToUse,
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

    await tx.auditLog.create({
      data: {
        userId,
        action: 'SEARCH_CAMPAIGN_ANALYZED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId: campaign.workspaceId,
          analyzedCount: analyses.length,
          creditsUsed: creditsToUse,
        },
      },
    });

    return analyses;
  });

  return { analyzedCount: result.length, creditsUsed: creditsToUse };
};
