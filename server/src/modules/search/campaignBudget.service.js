import { AppError, errorCodes } from '../../utils/AppError.js';

const DEFAULT_BUDGET = Object.freeze({
  maxDiscoveryCalls: 25,
  maxEnrichmentCalls: 50,
  maxAiAnalyses: 100,
  maxEstimatedExternalCostMicrousd: 250000,
  maxSerpQueries: 5,
  maxGooglePlacesQueries: 2,
  maxExternalResults: 20,
});

const COST_MICROUSD = Object.freeze({
  LOCAL_DATASET: 0,
  CSV_IMPORT: 0,
  WEBSITE_METADATA: 100,
  GOOGLE_PLACES: 1500,
  SERPAPI_DISCOVERY: 1000,
  UNKNOWN: 5000,
});

const positiveIntOrDefault = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const configuredBudget = (campaign) => {
  const filters = campaign?.filters && typeof campaign.filters === 'object' ? campaign.filters : {};
  const budget = filters.budget && typeof filters.budget === 'object' ? filters.budget : {};
  return {
    maxDiscoveryCalls: positiveIntOrDefault(budget.maxDiscoveryCalls, DEFAULT_BUDGET.maxDiscoveryCalls),
    maxEnrichmentCalls: positiveIntOrDefault(budget.maxEnrichmentCalls, DEFAULT_BUDGET.maxEnrichmentCalls),
    maxAiAnalyses: positiveIntOrDefault(budget.maxAiAnalyses, DEFAULT_BUDGET.maxAiAnalyses),
    maxEstimatedExternalCostMicrousd: positiveIntOrDefault(
      budget.maxEstimatedExternalCostMicrousd,
      DEFAULT_BUDGET.maxEstimatedExternalCostMicrousd
    ),
    maxSerpQueries: positiveIntOrDefault(budget.maxSerpQueries, DEFAULT_BUDGET.maxSerpQueries),
    maxGooglePlacesQueries: positiveIntOrDefault(budget.maxGooglePlacesQueries, DEFAULT_BUDGET.maxGooglePlacesQueries),
    maxExternalResults: positiveIntOrDefault(budget.maxExternalResults, DEFAULT_BUDGET.maxExternalResults),
  };
};

export const getCampaignBudget = (campaign) => configuredBudget(campaign);

export const estimateExternalCostMicrousd = ({ discoveryMethod, count = 1 }) => {
  const method = (discoveryMethod || 'UNKNOWN').toString().toUpperCase();
  const unitCost = COST_MICROUSD[method] ?? COST_MICROUSD.UNKNOWN;
  return unitCost * positiveIntOrDefault(count, 1);
};

const assertLimit = ({ label, planned, max }) => {
  if (planned > max) {
    throw new AppError(
      errorCodes.VALIDATION_ERROR,
      `${label} exceeds this campaign budget.`,
      400,
      { planned, max }
    );
  }
};

export const assertDiscoveryBudget = ({ campaign, plannedDiscoveryCalls = 0, discoveryMethod = 'UNKNOWN' }) => {
  const budget = getCampaignBudget(campaign);
  assertLimit({ label: 'Discovery calls', planned: plannedDiscoveryCalls, max: budget.maxDiscoveryCalls });
  const estimatedCost = estimateExternalCostMicrousd({ discoveryMethod, count: plannedDiscoveryCalls });
  assertLimit({
    label: 'Estimated external discovery cost',
    planned: estimatedCost,
    max: budget.maxEstimatedExternalCostMicrousd,
  });
  return { budget, estimatedCostMicrousd: estimatedCost };
};

export const assertEnrichmentBudget = ({ campaign, plannedEnrichmentCalls = 0, discoveryMethod = 'WEBSITE_METADATA' }) => {
  const budget = getCampaignBudget(campaign);
  assertLimit({ label: 'Enrichment calls', planned: plannedEnrichmentCalls, max: budget.maxEnrichmentCalls });
  const estimatedCost = estimateExternalCostMicrousd({ discoveryMethod, count: plannedEnrichmentCalls });
  assertLimit({
    label: 'Estimated external enrichment cost',
    planned: estimatedCost,
    max: budget.maxEstimatedExternalCostMicrousd,
  });
  return { budget, estimatedCostMicrousd: estimatedCost };
};

export const assertAiAnalysisBudget = ({ campaign, plannedAiAnalyses = 0 }) => {
  const budget = getCampaignBudget(campaign);
  assertLimit({ label: 'AI analyses', planned: plannedAiAnalyses, max: budget.maxAiAnalyses });
  return { budget };
};
