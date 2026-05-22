import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { toPagination } from '../../utils/pagination.js';
import { analyzeCampaign, analyzeLead, createCampaign, estimateCampaignCost, estimateSearchCreditsRequired } from './search.service.js';
import { getSourceStatusesWithRuntime } from './source.service.js';
import { getDashboardSummary, getCampaignAnalytics } from './dashboard.service.js';
import { enrichWebsiteUrl, mergeSignals } from './websiteEnrichment.service.js';
import { enqueueJobWithTx, getSearchJobBackpressureState } from '../jobs/jobQueue.service.js';
import {
  ANALYSIS_CREDITS,
  attachReservationJob,
  deductCredits,
  releaseSearchCreditReservation,
  reserveSearchCredits,
} from '../credits/credit.service.js';
import { buildRuleBasedAnalysisData, toLeadAnalysisCreateData } from './analysis.service.js';
import { runLeadAnalysisAiReview } from '../ai/leadAnalysisAi.service.js';
import { markCampaignCancelled, markCampaignQueued, QUEUEABLE_CAMPAIGN_STATUSES } from './campaignJob.service.js';
import { env } from '../../config/env.js';
import { normalizeCampaignTargeting } from './sourceTargetMapping.service.js';
import {
  getSupportedJordanGovernorates,
  leadMatchesGovernorate,
  normalizeCountry,
} from './locationNormalization.js';
import {
  mapCatalogLeadForUserResponse,
  mapSourceForUserResponse,
  sanitizeCampaignForUserResponse,
  sanitizeLeadForUserResponse,
  sanitizeLeadListForUserResponse,
  sanitizeLeadListItemForUserResponse,
} from './userResponseSanitizer.js';

const servicePresets = [
  'Website Development',
  'Website Redesign',
  'Digital Menu',
  'Booking System',
  'E-commerce Store',
  'Product Catalog',
  'Automation',
  'CRM Setup',
  'SEO',
  'Social Media Management',
  'Branding / Design',
  'Landing Page',
  'Lead Capture System',
  'Digital Presence Improvement',
];

const businessTypePresets = [
  'Cafes',
  'Restaurants',
  'Perfume Stores',
  'Cosmetics Stores',
  'Clothing Stores',
  'Clinics',
  'Dental Clinics',
  'Salons',
  'Gyms',
  'Real Estate',
  'Electronics Stores',
  'Home Supplies',
  'Electrical Supplies',
  'Bakeries',
  'Dessert Shops',
  'Car Services',
  'Hotels',
  'Travel Agencies',
  'Other',
];

const countryPresets = ['Jordan'];
const searchGoalPresets = [
  'Find businesses without websites',
  'Find businesses with weak online presence',
  'Find businesses with strong social presence but weak website',
  'Find businesses with high ratings but weak digital infrastructure',
  'Find businesses that may need a booking system',
  'Find businesses that may need a digital menu',
  'Find businesses with contact info',
  'Find Instagram-first businesses',
  'General opportunity discovery',
];

const titleCase = (value) => (value || '')
  .toString()
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeBusinessTypeOption = (value) => {
  const compact = (value || '').toString().trim().toLowerCase();
  if (!compact) return null;
  if (/(cafe|coffee|coffee shop|كافيه|قهوة)/.test(compact)) return 'Cafes';
  if (/(restaurant|food|مطعم)/.test(compact)) return 'Restaurants';
  if (/(perfume|fragrance|عطر)/.test(compact)) return 'Perfume Stores';
  if (/(cosmetic|beauty|makeup|تجميل)/.test(compact)) return 'Cosmetics Stores';
  if (/(clothing|fashion|apparel|ملابس)/.test(compact)) return 'Clothing Stores';
  return titleCase(value);
};

const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const catalogLeadSelect = {
  id: true,
  businessName: true,
  category: true,
  country: true,
  city: true,
  address: true,
  phone: true,
  whatsappNumber: true,
  email: true,
  websiteUrl: true,
  websiteStatus: true,
  instagramUrl: true,
  instagramUsername: true,
  facebookUrl: true,
  googleMapsUrl: true,
  latitude: true,
  longitude: true,
  source: true,
  rating: true,
  reviewCount: true,
  importedAt: true,
  detectedSignals: true,
  enrichmentData: true,
  createdAt: true,
  updatedAt: true,
};

const sortLeadResponses = (leads, sortBy, sortOrder) => {
  const direction = sortOrder === 'asc' ? 1 : -1;
  const field = ['rating', 'reviewCount', 'createdAt'].includes(sortBy) ? sortBy : 'createdAt';

  return [...leads].sort((a, b) => {
    const av = field === 'createdAt' ? new Date(a.createdAt || 0).getTime() : (a[field] ?? -Infinity);
    const bv = field === 'createdAt' ? new Date(b.createdAt || 0).getTime() : (b[field] ?? -Infinity);
    if (av === bv) return 0;
    return av > bv ? direction : -direction;
  });
};

const leadMatchesFilters = (lead, { source, city, status, missingWebsite, scoreLevel }) => {
  if (source && lead.source !== source && lead.source !== mapSourceForUserResponse(source)) return false;
  if (city && !leadMatchesGovernorate(lead, city)) return false;
  if (status && lead.status !== status) return false;
  if (missingWebsite === 'true' && lead.websiteUrl) return false;
  if (scoreLevel && lead.analyses?.[0]?.scoreLevel !== scoreLevel) return false;
  return true;
};

const enrichAnalysisDataForPersistence = ({ analysisData, aiResult }) => {
  const analysisSource = analysisData.analysisSource || 'RULE_BASED';
  const persistedAnalysisSource = analysisSource === 'AI_FALLBACK' ? 'RULE_BASED' : analysisSource;
  const detectedSignals = [
    ...(analysisData.detectedSignals || []),
    `ANALYSIS_SOURCE_${persistedAnalysisSource}`,
  ];
  if (aiResult?.ok && aiResult.provider) detectedSignals.push(`AI_PROVIDER_${aiResult.provider.toUpperCase()}`);

  const reasons = [...(analysisData.reasons || [])];
  if (analysisData.aiDataQualityNotes?.length) {
    reasons.push(...analysisData.aiDataQualityNotes.map((note) => `Data quality: ${note}`));
  }
  if (analysisData.aiRiskNotes?.length) {
    reasons.push(...analysisData.aiRiskNotes.map((note) => `Risk note: ${note}`));
  }

  return {
    ...analysisData,
    detectedSignals: [...new Set(detectedSignals)].slice(0, 24),
    reasons: reasons.slice(0, 16),
  };
};

const buildAnalysisResponseMetadata = ({ analysisData, aiResult }) => ({
  analysisSource: analysisData.analysisSource || 'RULE_BASED',
  aiProvider: aiResult?.ok ? aiResult.provider : null,
  aiModel: aiResult?.ok ? aiResult.model : null,
  aiFallbackUsed: Boolean(aiResult && !aiResult.ok && analysisData.analysisSource === 'AI_FALLBACK'),
  aiErrorType: aiResult && !aiResult.ok ? aiResult.errorType || null : null,
});

const inferAnalysisMetadata = (analysis = {}) => {
  const signals = Array.isArray(analysis.detectedSignals) ? analysis.detectedSignals : [];
  const sourceSignal = signals.find((signal) => signal.startsWith('ANALYSIS_SOURCE_'));
  const providerSignal = signals.find((signal) => signal.startsWith('AI_PROVIDER_'));
  const analysisSource = sourceSignal?.replace('ANALYSIS_SOURCE_', '') || 'RULE_BASED';
  const aiProvider = providerSignal ? providerSignal.replace('AI_PROVIDER_', '').toLowerCase() : null;
  return {
    analysisSource,
    aiProvider,
    aiModel: null,
    aiFallbackUsed: analysisSource === 'AI_FALLBACK',
    aiErrorType: null,
  };
};

// ═══════════════════════════════════════
// SOURCE STATUS
// ═══════════════════════════════════════
export const getSourceStatus = asyncHandler(async (_req, res) => {
  const { sources, presenceTargets } = await getSourceStatusesWithRuntime({ userId: _req.user.id });
  return successResponse(res, { sources, presenceTargets }, 'Source statuses loaded.');
});

export const getSearchOptions = asyncHandler(async (req, res) => {
  const workspace = await prisma.workspaceMember.findFirst({
    where: { userId: req.user.id },
    select: { workspaceId: true },
  });

  const workspaceId = workspace?.workspaceId || null;
  const leadWhere = {
    source: { in: ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN'] },
  };

  const [leads, sourceSets] = await Promise.all([
    prisma.leadCatalog.findMany({
      where: leadWhere,
      select: {
        category: true,
        country: true,
        city: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    getSourceStatusesWithRuntime({ userId: req.user.id, workspaceId }),
  ]);

  const datasetBusinessTypes = leads.map((lead) => normalizeBusinessTypeOption(lead.category));
  const countries = uniqueSorted([
    ...countryPresets,
    ...leads.map((lead) => normalizeCountry(lead.country)),
  ]);
  const governorates = getSupportedJordanGovernorates();
  const cities = governorates;

  return successResponse(res, {
    services: servicePresets,
    businessTypes: uniqueSorted([...businessTypePresets, ...datasetBusinessTypes]),
    countries,
    governorates,
    cities,
    searchGoals: searchGoalPresets,
    sources: sourceSets.sources,
    presenceTargets: sourceSets.presenceTargets,
    maxResultsOptions: [10, 20, 50, 100],
  }, 'Search options loaded.');
});

// ═══════════════════════════════════════
// DASHBOARD SUMMARY
// ═══════════════════════════════════════
export const getDashboardIntelligence = asyncHandler(async (req, res) => {
  const workspace = await prisma.workspaceMember.findFirst({
    where: { userId: req.user.id },
    select: { workspaceId: true },
  });
  if (!workspace) return successResponse(res, {}, 'No workspace found.');

  const summary = await getDashboardSummary(req.user.id, workspace.workspaceId);
  const sourceSets = await getSourceStatusesWithRuntime({ userId: req.user.id, workspaceId: workspace.workspaceId });
  return successResponse(res, { summary, sources: sourceSets.sources, presenceTargets: sourceSets.presenceTargets }, 'Intelligence dashboard loaded.');
});

// ═══════════════════════════════════════
// SERVICE PROFILES
// ═══════════════════════════════════════
export const getServiceProfiles = asyncHandler(async (req, res) => {
  const profiles = await prisma.serviceProfile.findMany({ where: { userId: req.user.id } });
  return successResponse(res, { profiles }, 'Profiles loaded.');
});

export const createServiceProfile = asyncHandler(async (req, res) => {
  const { name, serviceType, targetBusinessTypes, targetLocations, offerDescription, idealSignals, workspaceId } = req.validated.body;
  
  const workspace = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.user.id } }
  });
  if (!workspace) throw new AppError(errorCodes.FORBIDDEN, 'You do not have access to this workspace.', 403);

  const profile = await prisma.serviceProfile.create({
    data: {
      userId: req.user.id,
      workspaceId,
      name,
      serviceType,
      targetBusinessTypes,
      targetLocations,
      offerDescription,
      idealSignals,
    },
  });
  return successResponse(res, { profile }, 'Profile created.', 201);
});

// ═══════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════
export const getCampaigns = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const where = { userId: req.user.id };
  const [campaigns, total] = await prisma.$transaction([
    prisma.searchCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true, name: true, status: true, resultCount: true, creditsUsed: true,
        city: true, country: true, sources: true, createdAt: true, startedAt: true, completedAt: true,
        failedAt: true, errorCode: true, errorMessage: true, progressCurrent: true, progressTotal: true, lastStep: true,
        _count: { select: { leads: true } },
      },
    }),
    prisma.searchCampaign.count({ where }),
  ]);
  return successResponse(res, {
    campaigns: campaigns.map(sanitizeCampaignForUserResponse),
    pagination: { page: pagination.page, limit: pagination.limit, total },
  }, 'Campaigns loaded.');
});

export const createNewCampaign = asyncHandler(async (req, res) => {
  const data = req.validated.body;
  
  const workspace = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: data.workspaceId, userId: req.user.id } }
  });
  if (!workspace) throw new AppError(errorCodes.FORBIDDEN, 'You do not have access to this workspace.', 403);

  if (data.serviceProfileId) {
    const profile = await prisma.serviceProfile.findFirst({
      where: {
        id: data.serviceProfileId,
        userId: req.user.id,
        workspaceId: data.workspaceId,
      },
      select: { id: true },
    });

    if (!profile) {
      throw new AppError(errorCodes.FORBIDDEN, 'You do not have access to this service profile.', 403);
    }
  }

  const normalizedTargeting = normalizeCampaignTargeting(data);
  const normalizedData = {
    ...data,
    sources: normalizedTargeting.discoverySources,
    filters: {
      ...(data.filters || {}),
      presenceTargets: normalizedTargeting.presenceTargets,
      presenceTargetMode: data.filters?.presenceTargetMode || 'prioritize',
    },
  };

  const campaign = await createCampaign({ userId: req.user.id, workspaceId: data.workspaceId, data: normalizedData });
  return successResponse(res, { campaign: sanitizeCampaignForUserResponse(campaign) }, 'Campaign created.', 201);
});

export const getCampaignById = asyncHandler(async (req, res) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    include: {
      _count: { select: { leads: true, leadAnalyses: true } },
      serviceProfile: { select: { id: true, name: true, serviceType: true } },
    },
  });
  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);
  return successResponse(res, { campaign: sanitizeCampaignForUserResponse(campaign) }, 'Campaign loaded.');
});

export const runExistingCampaign = asyncHandler(async (req, res) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    select: { id: true, workspaceId: true, status: true, requestedLimit: true },
  });
  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);

  if (['QUEUED', 'RUNNING'].includes(campaign.status)) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Campaign is already queued or running.', 409);
  }

  if (!QUEUEABLE_CAMPAIGN_STATUSES.includes(campaign.status)) {
    throw new AppError(errorCodes.CAMPAIGN_NOT_RUNNABLE, `Campaign cannot be run while status is ${campaign.status}.`, 409);
  }

  const { queuedCount, runningCount, userActiveCount } = await getSearchJobBackpressureState({ userId: req.user.id });
  if (queuedCount >= env.MAX_QUEUED_SEARCH_JOBS || runningCount >= env.MAX_RUNNING_SEARCH_JOBS) {
    throw new AppError(errorCodes.RATE_LIMITED, 'Search queue is busy. Try again shortly.', 429);
  }
  if (userActiveCount >= env.MAX_ACTIVE_SEARCH_JOBS_PER_USER) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'You already have active searches. Wait for one to finish before starting another.', 409);
  }

  const job = await prisma.$transaction(async (tx) => {
    const maxCreditsRequired = estimateSearchCreditsRequired(campaign.requestedLimit || 20);
    await markCampaignQueued({
      tx,
      campaignId: campaign.id,
      userId: req.user.id,
      requestedLimit: campaign.requestedLimit || 20,
      lockedBy: 'api-queue',
    });

    const reservation = await reserveSearchCredits({
      tx,
      userId: req.user.id,
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      amount: maxCreditsRequired,
      reason: `Reserved search credits: ${campaign.id}`,
    });

    const createdJob = await enqueueJobWithTx(tx, {
      userId: req.user.id,
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      type: 'SEARCH_CAMPAIGN_RUN',
      payload: { campaignId: campaign.id },
    });

    await attachReservationJob({ tx, reservationId: reservation.id, jobId: createdJob.id });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SEARCH_CAMPAIGN_QUEUED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: {
          workspaceId: campaign.workspaceId,
          jobId: createdJob.id,
          creditsReserved: maxCreditsRequired,
        },
      },
    });

    return createdJob;
  });

  return successResponse(res, {
    campaignId: campaign.id,
    jobId: job.id,
    status: 'QUEUED',
    nextAction: 'POLL_STATUS',
  }, 'Campaign queued. Poll the campaign status endpoint.', 202);
});

export const cancelCampaignRun = asyncHandler(async (req, res) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    select: { id: true, userId: true, workspaceId: true, status: true },
  });
  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);

  if (!['QUEUED', 'RUNNING'].includes(campaign.status)) {
    throw new AppError(errorCodes.CAMPAIGN_NOT_RUNNABLE, 'Only queued or running campaigns can be cancelled.', 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    const latestJob = await tx.job.findFirst({
      where: { campaignId: campaign.id, type: 'SEARCH_CAMPAIGN_RUN', status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });

    if (latestJob?.status === 'QUEUED') {
      await tx.job.update({
        where: { id: latestJob.id },
        data: {
          status: 'CANCELLED',
          cancelRequestedAt: new Date(),
          failedAt: new Date(),
          errorCode: 'JOB_CANCELLED',
          errorMessage: 'Campaign was cancelled before it started.',
        },
      });
    } else if (latestJob?.status === 'RUNNING') {
      await tx.job.update({
        where: { id: latestJob.id },
        data: {
          cancelRequestedAt: new Date(),
          errorCode: 'JOB_CANCELLED',
          errorMessage: 'Campaign cancellation was requested.',
        },
      });
    }

    await releaseSearchCreditReservation({
      tx,
      userId: req.user.id,
      campaignId: campaign.id,
      status: 'CANCELLED',
    });

    await markCampaignCancelled({
      tx,
      campaignId: campaign.id,
      userId: req.user.id,
      errorMessage: latestJob?.status === 'RUNNING'
        ? 'Campaign cancellation requested. Any in-progress work will stop at the next safe checkpoint.'
        : 'Campaign was cancelled.',
    });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SEARCH_CAMPAIGN_CANCELLED',
        entityType: 'SearchCampaign',
        entityId: campaign.id,
        metadata: { workspaceId: campaign.workspaceId, jobId: latestJob?.id || null },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    });

    return latestJob;
  });

  return successResponse(res, {
    campaignId: campaign.id,
    jobId: result?.id || null,
    status: 'CANCELLED',
  }, 'Campaign cancelled.');
});

export const getCampaignStatus = asyncHandler(async (req, res) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    select: {
      id: true,
      status: true,
      resultCount: true,
      creditsUsed: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      errorCode: true,
      errorMessage: true,
      progressCurrent: true,
      progressTotal: true,
      lastStep: true,
      jobs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
          lastHeartbeatAt: true,
          cancelRequestedAt: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
        },
      },
      leadLists: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          resultCount: true,
        },
      },
    },
  });

  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);

  return successResponse(res, {
    campaign: {
      ...campaign,
      job: campaign.jobs?.[0] || null,
      leadListId: campaign.leadLists?.[0]?.id || null,
      resultCount: campaign.resultCount || campaign.leadLists?.[0]?.resultCount || 0,
      jobs: undefined,
      leadLists: undefined,
    },
  }, 'Campaign status loaded.');
});

export const getCampaignLeads = asyncHandler(async (req, res) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    select: { id: true },
  });
  if (!campaign) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);

  const [directLeads, listItems] = await Promise.all([
    prisma.lead.findMany({
      where: { campaignId: campaign.id, userId: req.user.id },
      include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leadListLead.findMany({
      where: {
        leadList: {
          campaignId: campaign.id,
          userId: req.user.id,
        },
      },
      include: {
        catalogLead: { select: catalogLeadSelect },
        lead: { include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } } },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const snapshotLeads = listItems
    .map((item) => (item.catalogLead ? mapCatalogLeadForUserResponse(item.catalogLead, item) : sanitizeLeadForUserResponse(item.lead)))
    .filter(Boolean);

  return successResponse(res, { leads: [...snapshotLeads, ...directLeads.map(sanitizeLeadForUserResponse)] }, 'Campaign leads loaded.');
});

export const getCampaignAnalyticsData = asyncHandler(async (req, res) => {
  const analytics = await getCampaignAnalytics(req.validated.params.id, req.user.id);
  if (!analytics) throw new AppError(errorCodes.NOT_FOUND, 'Campaign not found.', 404);
  return successResponse(res, { analytics }, 'Campaign analytics loaded.');
});

export const analyzeExistingCampaign = asyncHandler(async (req, res) => {
  const result = await analyzeCampaign({
    campaignId: req.validated.params.id,
    userId: req.user.id,
  });

  return successResponse(res, result, 'Campaign analysis completed.');
});

// ═══════════════════════════════════════
// LEAD LISTS
// ═══════════════════════════════════════
export const getLeadLists = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const where = { userId: req.user.id };
  const [lists, total] = await prisma.$transaction([
    prisma.leadList.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      include: { _count: { select: { leads: true, leadItems: true } } },
    }),
    prisma.leadList.count({ where }),
  ]);
  const mapped = lists.map(sanitizeLeadListForUserResponse);
  return successResponse(res, { lists: mapped, pagination: { page: pagination.page, limit: pagination.limit, total } }, 'Lead lists loaded.');
});

export const getLeadListById = asyncHandler(async (req, res) => {
  const list = await prisma.leadList.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    include: {
      campaign: { select: { id: true, name: true, status: true, city: true, country: true, businessTypes: true } },
      _count: { select: { leads: true, leadItems: true } },
    },
  });

  if (!list) throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);

  return successResponse(res, {
    list: sanitizeLeadListForUserResponse(list),
  }, 'Lead list loaded.');
});

export const getOpportunitySignals = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const where = { userId: req.user.id };
  const [signals, total] = await prisma.$transaction([
    prisma.opportunitySignal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        campaignId: true,
        source: true,
        sourceUrl: true,
        title: true,
        snippet: true,
        subreddit: true,
        postedAt: true,
        score: true,
        commentCount: true,
        matchedKeywords: true,
        detectedIntent: true,
        confidence: true,
        createdAt: true,
      },
    }),
    prisma.opportunitySignal.count({ where }),
  ]);

  return successResponse(res, {
    signals,
    pagination: { page: pagination.page, limit: pagination.limit, total },
  }, 'Opportunity signals loaded.');
});

// ═══════════════════════════════════════
// LEADS
// ═══════════════════════════════════════
export const getLeads = asyncHandler(async (req, res) => {
  const { campaignId, source, city, scoreLevel, status, missingWebsite, sortBy, sortOrder } = req.validated.query;
  const listId = req.validated.query.listId || req.validated.params?.id;
  const pagination = toPagination(req.validated.query);
  const where = { userId: req.user.id };
  if (listId) where.leadListId = listId;
  if (campaignId) where.campaignId = campaignId;
  if (source) where.source = source;
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (status) where.status = status;
  if (missingWebsite === 'true') where.websiteUrl = null;

  let orderBy = { createdAt: 'desc' };
  if (sortBy === 'rating') orderBy = { rating: sortOrder === 'asc' ? 'asc' : 'desc' };
  else if (sortBy === 'reviewCount') orderBy = { reviewCount: sortOrder === 'asc' ? 'asc' : 'desc' };
  else if (sortBy === 'createdAt') orderBy = { createdAt: sortOrder === 'asc' ? 'asc' : 'desc' };

  if (listId) {
    const list = await prisma.leadList.findFirst({
      where: { id: listId, userId: req.user.id },
      select: { id: true },
    });
    if (!list) throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);

    const items = await prisma.leadListLead.findMany({
      where: { leadListId: listId },
      include: {
        catalogLead: {
          select: {
            ...catalogLeadSelect,
          },
        },
        lead: {
          include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      take: 2000,
    });
    const mapped = items
      .map((item) => (item.catalogLead ? mapCatalogLeadForUserResponse(item.catalogLead, item) : sanitizeLeadForUserResponse(item.lead)))
      .filter(Boolean)
      .filter((lead) => leadMatchesFilters(lead, { source, city, status, missingWebsite, scoreLevel }));

    return successResponse(res, {
      leads: mapped.slice(pagination.skip, pagination.skip + pagination.take),
      pagination: { page: pagination.page, limit: pagination.limit, total: mapped.length },
    }, 'Leads loaded.');
  }

  const candidateLimit = 5000;
  const [leads, listItems] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        category: true,
        country: true,
        city: true,
        address: true,
        phone: true,
        whatsappNumber: true,
        email: true,
        websiteUrl: true,
        websiteStatus: true,
        instagramUrl: true,
        instagramUsername: true,
        facebookUrl: true,
        googleMapsUrl: true,
        source: true,
        rating: true,
        reviewCount: true,
        importedAt: true,
        status: true,
        detectedSignals: true,
        enrichmentData: true,
        createdAt: true,
        updatedAt: true,
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy,
      take: candidateLimit,
    }),
    prisma.leadListLead.findMany({
      where: {
        leadList: {
          userId: req.user.id,
          ...(campaignId ? { campaignId } : {}),
        },
      },
      include: {
        catalogLead: { select: catalogLeadSelect },
        lead: { include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } } },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: candidateLimit,
    }),
  ]);

  const mappedListItems = listItems
    .map((item) => (item.catalogLead ? mapCatalogLeadForUserResponse(item.catalogLead, item) : sanitizeLeadForUserResponse(item.lead)))
    .filter(Boolean);

  const combined = [...mappedListItems, ...leads.map(sanitizeLeadForUserResponse)];
  const seen = new Set();
  const deduped = combined.filter((lead) => {
    const key = lead.leadListItemId || lead.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = sortLeadResponses(
    deduped.filter((lead) => leadMatchesFilters(lead, { source, city, status, missingWebsite, scoreLevel })),
    sortBy,
    sortOrder,
  );

  return successResponse(res, {
    leads: filtered.slice(pagination.skip, pagination.skip + pagination.take),
    pagination: { page: pagination.page, limit: pagination.limit, total: filtered.length },
  }, 'Leads loaded.');
});

export const getLeadDetail = asyncHandler(async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    include: {
      analyses: { orderBy: { createdAt: 'desc' } },
      leadList: { select: { id: true, name: true } },
    },
  });
  if (lead) return successResponse(res, { lead: sanitizeLeadForUserResponse(lead) }, 'Lead detail loaded.');

  const item = await prisma.leadListLead.findFirst({
    where: {
      OR: [
        { id: req.validated.params.id },
        { catalogLeadId: req.validated.params.id },
      ],
      leadList: { userId: req.user.id },
    },
    include: {
      catalogLead: { select: catalogLeadSelect },
      leadList: { select: { id: true, name: true, campaignId: true } },
      analyses: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!item?.catalogLead) throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);

  return successResponse(res, {
    lead: {
      ...mapCatalogLeadForUserResponse(item.catalogLead, { ...item, analyses: item.analyses }),
      leadList: item.leadList,
    },
  }, 'Lead detail loaded.');
});

export const analyzeExistingLead = asyncHandler(async (req, res) => {
  const result = await analyzeLead({
    leadId: req.validated.params.id,
    userId: req.user.id,
  });

  return successResponse(res, result, result.reused ? 'Existing lead analysis loaded.' : 'Lead analysis completed.');
});

export const getLeadsForMap = asyncHandler(async (req, res) => {
  const [directLeads, listItems] = await Promise.all([
    prisma.lead.findMany({
      where: {
        userId: req.user.id,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        latitude: true,
        longitude: true,
        rating: true,
        reviewCount: true,
        websiteUrl: true,
        phone: true,
        status: true,
        source: true,
        analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { opportunityScore: true, scoreLevel: true, suggestedService: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.leadListLead.findMany({
      where: {
        leadList: { userId: req.user.id },
        catalogLead: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        catalogLead: { select: catalogLeadSelect },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { opportunityScore: true, scoreLevel: true, suggestedService: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
  ]);

  const catalogLeads = listItems
    .map((item) => mapCatalogLeadForUserResponse(item.catalogLead, item))
    .filter((lead) => lead.latitude != null && lead.longitude != null);

  return successResponse(res, {
    leads: [...catalogLeads, ...directLeads.map(sanitizeLeadForUserResponse)].slice(0, 500),
  }, 'Map leads loaded.');
});

export const updateLeadStatus = asyncHandler(async (req, res) => {
  const { status } = req.validated.body;
  const updated = await prisma.lead.updateMany({
    where: { id: req.validated.params.id, userId: req.user.id },
    data: { status },
  });

  if (updated.count !== 1) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);
  }

  const lead = await prisma.lead.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
  });

  return successResponse(res, { lead: sanitizeLeadForUserResponse(lead) }, 'Lead updated.');
});

export const deleteLead = asyncHandler(async (req, res) => {
  const deleted = await prisma.lead.deleteMany({
    where: { id: req.validated.params.id, userId: req.user.id },
  });

  if (deleted.count !== 1) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);
  }

  return successResponse(res, {}, 'Lead deleted.');
});

export const enrichLeadWebsite = asyncHandler(async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.validated.params.id, userId: req.user.id },
    select: {
      id: true,
      businessName: true,
      workspaceId: true,
      websiteUrl: true,
      detectedSignals: true,
    },
  });

  if (!lead) throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);
  if (!lead.websiteUrl) throw new AppError(errorCodes.VALIDATION_ERROR, 'Lead does not have a website URL to enrich.', 400);

  const enrichment = await enrichWebsiteUrl(lead.websiteUrl);
  const detectedSignals = mergeSignals(lead.detectedSignals, enrichment.detectedSignals);

  const updatedLead = await prisma.$transaction(async (tx) => {
    const creditResult = await deductCredits({
      tx,
      userId: req.user.id,
      workspaceId: lead.workspaceId,
      amount: 1,
      type: 'CREDIT_USED',
      reason: `Website enrichment: ${lead.businessName}`,
      referenceType: 'Lead',
      referenceId: lead.id,
    });

    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: {
        websiteStatus: enrichment.websiteStatus,
        enrichmentData: enrichment,
        detectedSignals,
      },
      select: {
        id: true,
        websiteStatus: true,
        enrichmentData: true,
        detectedSignals: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LEAD_WEBSITE_ENRICHED',
        entityType: 'Lead',
        entityId: lead.id,
        metadata: {
          workspaceId: lead.workspaceId,
          websiteStatus: enrichment.websiteStatus,
          creditsUsed: 1,
          balanceAfter: creditResult.balanceAfter,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    });

    return updated;
  });

  return successResponse(res, { lead: updatedLead }, 'Website enrichment completed.');
});

// ═══════════════════════════════════════
// LEAD LIST ITEMS (Catalog-backed workflow)
// ═══════════════════════════════════════

export const updateListItemStatus = asyncHandler(async (req, res) => {
  const { listId, itemId } = req.validated.params;
  const { status } = req.validated.body;

  const leadList = await prisma.leadList.findFirst({
    where: { id: listId, userId: req.user.id },
  });

  if (!leadList) throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);

  const updated = await prisma.leadListLead.updateMany({
    where: { id: itemId, leadListId: listId },
    data: { status },
  });

  if (updated.count !== 1) {
    throw new AppError(errorCodes.NOT_FOUND, 'List item not found.', 404);
  }

  const item = await prisma.leadListLead.findFirst({
    where: { id: itemId, leadListId: listId },
  });

  return successResponse(res, { item: sanitizeLeadListItemForUserResponse(item) }, 'Lead list item status updated.');
});

export const updateListItemNotes = asyncHandler(async (req, res) => {
  const { listId, itemId } = req.validated.params;
  const { notes } = req.validated.body;

  const leadList = await prisma.leadList.findFirst({
    where: { id: listId, userId: req.user.id },
  });

  if (!leadList) throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);

  const updated = await prisma.leadListLead.updateMany({
    where: { id: itemId, leadListId: listId },
    data: { notes },
  });

  if (updated.count !== 1) {
    throw new AppError(errorCodes.NOT_FOUND, 'List item not found.', 404);
  }

  const item = await prisma.leadListLead.findFirst({
    where: { id: itemId, leadListId: listId },
  });

  return successResponse(res, { item: sanitizeLeadListItemForUserResponse(item) }, 'Lead list item notes updated.');
});

export const analyzeListItem = asyncHandler(async (req, res) => {
  const { listId, itemId } = req.validated.params;

  const item = await prisma.leadListLead.findFirst({
    where: { id: itemId, leadListId: listId },
    include: {
      leadList: { include: { campaign: { include: { serviceProfile: true } } } },
      lead: true,
      catalogLead: true,
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!item || item.leadList.userId !== req.user.id) {
    throw new AppError(errorCodes.NOT_FOUND, 'List item not found or you do not have permission.', 404);
  }

  const forceReanalyze = req.validated.query?.force === 'true';

  if (item.analyses.length > 0 && !forceReanalyze) {
    const metadata = inferAnalysisMetadata(item.analyses[0]);
    return successResponse(res, {
      analysis: { ...item.analyses[0], ...metadata },
      reused: true,
      creditsUsed: 0,
      ...metadata,
    }, 'Existing item analysis loaded.');
  }

  const sourceLead = item.lead || item.catalogLead;
  if (!sourceLead) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'List item has no lead data.', 400);
  }

  const profile = item.leadList.campaign?.serviceProfile || { serviceType: 'Digital Presence Improvement' };
  const userCredits = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { creditsBalance: true },
  });
  if (!userCredits || userCredits.creditsBalance < ANALYSIS_CREDITS) {
    throw new AppError(errorCodes.INSUFFICIENT_FUNDS, 'Insufficient credits.', 402);
  }

  const ruleBasedAnalysis = buildRuleBasedAnalysisData({ lead: sourceLead, profile });
  const aiReview = await runLeadAnalysisAiReview({
    lead: sourceLead,
    profile,
    campaign: item.leadList.campaign,
    ruleBasedAnalysis,
  });
  const finalAnalysisData = enrichAnalysisDataForPersistence({
    analysisData: aiReview.analysis,
    aiResult: aiReview.aiResult,
  });
  const responseMetadata = buildAnalysisResponseMetadata({
    analysisData: finalAnalysisData,
    aiResult: aiReview.aiResult,
  });

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.leadListLead.updateMany({
      where: {
        id: item.id,
        leadListId: listId,
        leadList: { userId: req.user.id },
        ...(forceReanalyze ? {} : { analyses: { none: {} } }),
        OR: [
          { analysisStatus: null },
          { analysisStatus: { notIn: forceReanalyze ? ['PROCESSING'] : ['PROCESSING', 'COMPLETED'] } },
        ],
      },
      data: { analysisStatus: 'PROCESSING' },
    });

    if (claimed.count !== 1) {
      const existing = await tx.leadListLead.findFirst({
        where: { id: item.id, leadListId: listId, leadList: { userId: req.user.id } },
        include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (existing?.analyses?.[0] && !forceReanalyze) {
        const metadata = inferAnalysisMetadata(existing.analyses[0]);
        return {
          analysis: { ...existing.analyses[0], ...metadata },
          reused: true,
          creditsUsed: 0,
          ...metadata,
        };
      }

      throw new AppError(errorCodes.CONFLICT, 'Lead analysis is already in progress.', 409);
    }

    await deductCredits({
      tx,
      userId: req.user.id,
      workspaceId: item.leadList.workspaceId,
      amount: ANALYSIS_CREDITS,
      type: 'CREDIT_USED',
      reason: `Analyzed lead list item: ${sourceLead.businessName}`,
      referenceType: 'LeadListLead',
      referenceId: item.id,
    });

    const analysis = await tx.leadAnalysis.create({
      data: toLeadAnalysisCreateData({
        lead: sourceLead,
        analysisData: finalAnalysisData,
        userId: req.user.id,
        workspaceId: item.leadList.workspaceId,
        campaignId: item.leadList.campaignId,
        leadListLeadId: item.id,
      }),
    });

    await tx.leadListLead.update({
      where: { id: item.id },
      data: {
        analysisStatus: 'COMPLETED',
        analyzedAt: new Date(),
        score: analysis.opportunityScore,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LEAD_LIST_ITEM_ANALYZED',
        entityType: 'LeadListLead',
        entityId: item.id,
        metadata: {
          workspaceId: item.leadList.workspaceId,
          analysisId: analysis.id,
          creditsUsed: ANALYSIS_CREDITS,
          analysisSource: responseMetadata.analysisSource,
          aiProvider: responseMetadata.aiProvider,
          aiFallbackUsed: responseMetadata.aiFallbackUsed,
        },
      },
    });

    return {
      analysis: {
        ...analysis,
        analysisSource: responseMetadata.analysisSource,
        aiProvider: responseMetadata.aiProvider,
        aiModel: responseMetadata.aiModel,
        aiFallbackUsed: responseMetadata.aiFallbackUsed,
      },
      reused: false,
      creditsUsed: ANALYSIS_CREDITS,
      ...responseMetadata,
    };
  });

  return successResponse(res, result, result.reused ? 'Existing item analysis loaded.' : 'Lead list item analysis completed.');
});

export const analyzeListItems = asyncHandler(async (req, res) => {
  const { id: listId } = req.validated.params;

  const leadList = await prisma.leadList.findFirst({
    where: { id: listId, userId: req.user.id },
    include: { campaign: { include: { serviceProfile: true } } },
  });

  if (!leadList) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);
  }

  const items = await prisma.leadListLead.findMany({
    where: {
      leadListId: listId,
      OR: [
        { analysisStatus: null },
        { analysisStatus: { notIn: ['COMPLETED'] } },
      ],
      analyses: { none: {} },
    },
    include: { lead: true, catalogLead: true },
    take: 100,
  });

  if (items.length === 0) {
    return successResponse(res, { analyzedCount: 0, creditsUsed: 0, aiAssistedCount: 0, fallbackCount: 0, failedCount: 0, skippedExistingCount: 0 }, 'No items require analysis or list empty.');
  }

  const profile = leadList.campaign?.serviceProfile || { serviceType: 'Digital Presence Improvement' };
  
  let analyzedCount = 0;
  let creditsUsed = 0;
  let aiAssistedCount = 0;
  let fallbackCount = 0;
  let failedCount = 0;
  let skippedExistingCount = 0;

  const results = [];

  const concurrency = Math.max(1, Math.min(Number(env.AI_ANALYSIS_CONCURRENCY) || 2, 5));
  
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    
    const chunkPromises = chunk.map(async (item) => {
      const sourceLead = item.lead || item.catalogLead;
      if (!sourceLead) return { item, status: 'failed', reason: 'no_lead_data' };

      const userCredits = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { creditsBalance: true },
      });
      if (!userCredits || userCredits.creditsBalance < ANALYSIS_CREDITS) {
        return { item, status: 'failed', reason: 'insufficient_credits' };
      }

      try {
        const ruleBasedAnalysis = buildRuleBasedAnalysisData({ lead: sourceLead, profile });
        const aiReview = await runLeadAnalysisAiReview({
          lead: sourceLead,
          profile,
          campaign: leadList.campaign,
          ruleBasedAnalysis,
        });

        const finalAnalysisData = enrichAnalysisDataForPersistence({
          analysisData: aiReview.analysis,
          aiResult: aiReview.aiResult,
        });
        const responseMetadata = buildAnalysisResponseMetadata({
          analysisData: finalAnalysisData,
          aiResult: aiReview.aiResult,
        });

        const result = await prisma.$transaction(async (tx) => {
          const currentItem = await tx.leadListLead.findFirst({
            where: { id: item.id },
            include: { analyses: { select: { id: true } } },
          });

          if (currentItem.analyses.length > 0 || currentItem.analysisStatus === 'COMPLETED') {
            return { status: 'skipped' };
          }

          await deductCredits({
            tx,
            userId: req.user.id,
            workspaceId: leadList.workspaceId,
            amount: ANALYSIS_CREDITS,
            type: 'CREDIT_USED',
            reason: `Analyzed list item in batch: ${sourceLead.businessName}`,
            referenceType: 'LeadListLead',
            referenceId: item.id,
          });

          const analysis = await tx.leadAnalysis.create({
            data: toLeadAnalysisCreateData({
              lead: sourceLead,
              analysisData: finalAnalysisData,
              userId: req.user.id,
              workspaceId: leadList.workspaceId,
              campaignId: leadList.campaignId,
              leadListLeadId: item.id,
            }),
          });

          await tx.leadListLead.update({
            where: { id: item.id },
            data: {
              analysisStatus: 'COMPLETED',
              analyzedAt: new Date(),
              score: analysis.opportunityScore,
            },
          });

          return { status: 'analyzed', responseMetadata, analysis };
        });

        return { item, ...result };
      } catch (err) {
        logger.error(`[Bulk Analysis] Failed for item ${item.id}:`, err);
        return { item, status: 'failed', reason: 'error' };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const scoreDistribution = { GOLD: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const topOpportunities = [];

  for (const res of results) {
    if (res.status === 'skipped') {
      skippedExistingCount++;
    } else if (res.status === 'failed') {
      failedCount++;
    } else if (res.status === 'analyzed') {
      analyzedCount++;
      creditsUsed += ANALYSIS_CREDITS;
      if (res.responseMetadata.analysisSource === 'AI_ASSISTED') {
        aiAssistedCount++;
      } else {
        fallbackCount++;
      }
      
      const level = res.analysis.scoreLevel;
      if (scoreDistribution[level] !== undefined) scoreDistribution[level]++;
      
      topOpportunities.push(res.analysis);
    }
  }

  // Create audit log for the batch run
  if (analyzedCount > 0) {
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'LEAD_LIST_BULK_ANALYZED',
        entityType: 'LeadList',
        entityId: leadList.id,
        metadata: {
          workspaceId: leadList.workspaceId,
          analyzedCount,
          creditsUsed,
          aiAssistedCount,
          fallbackCount,
        },
      },
    });
  }

  // Sort top opportunities
  topOpportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return successResponse(res, {
    analyzedCount,
    creditsUsed,
    aiAssistedCount,
    fallbackCount,
    failedCount,
    skippedExistingCount,
    scoreDistribution,
    topOpportunities: topOpportunities.slice(0, 3).map(a => ({
      id: a.id,
      leadListLeadId: a.leadListLeadId,
      score: a.opportunityScore,
      level: a.scoreLevel,
      service: a.suggestedService
    }))
  }, 'Lead list bulk analysis completed.');
});

// ═══════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════
export const getCreditsHistory = asyncHandler(async (req, res) => {
  const ledger = await prisma.creditLedger.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { creditsBalance: true } });
  return successResponse(res, { balance: user?.creditsBalance || 0, ledger }, 'Credits loaded.');
});

export const estimateSearchCost = asyncHandler(async (req, res) => {
  const { requestedLimit, sources, enrichment, analysis } = req.validated.query;
  const limit = parseInt(requestedLimit, 10) || 20;
  const selectedSources = sources ? sources.split(',').map((source) => source.trim()).filter(Boolean) : [];
  const estimate = estimateCampaignCost({
    requestedLimit: limit,
    sources: selectedSources,
    enrichment: enrichment === 'true',
    analysis: analysis === 'true',
  });
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { creditsBalance: true } });
  const canAfford = (user?.creditsBalance || 0) >= estimate.estimatedMax;

  return successResponse(res, {
    ...estimate,
    currentBalance: user?.creditsBalance || 0,
    canAfford,
  }, 'Cost estimate calculated.');
});
