import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getCreditHistory, getCreditsSummary } from './credit.service.js';
import { estimateCampaignCost } from '../search/search.service.js';
import { getSourceStatuses } from '../search/source.service.js';

export const creditsSummary = asyncHandler(async (req, res) => {
  const credits = await getCreditsSummary(req.user.id);

  return successResponse(res, { credits }, 'Credits loaded.');
});

export const creditsHistory = asyncHandler(async (req, res) => {
  const ledger = await getCreditHistory(req.user.id, req.validated.query);

  return successResponse(res, { ledger }, 'Credit history loaded.');
});

export const estimateSearchCredits = asyncHandler(async (req, res) => {
  const { sources = '', maxResults, enrichment, analysis } = req.validated.query;
  const selectedSources = sources
    .split(',')
    .map((source) => source.trim())
    .filter(Boolean);

  const estimate = estimateCampaignCost({
    requestedLimit: maxResults,
    sources: selectedSources,
    enrichment: enrichment === 'true',
    analysis: analysis === 'true',
  });
  const credits = await getCreditsSummary(req.user.id);
  const statuses = getSourceStatuses();
  const sourceAvailability = selectedSources.map((source) => {
    const status = statuses.find((item) => item.key === source);
    return {
      source,
      configured: Boolean(status?.configured),
      available: Boolean(status?.available),
      status: status?.status || 'unknown',
      reason: status?.reason || null,
    };
  });

  return successResponse(res, {
    estimatedCredits: estimate.estimatedTotal,
    breakdown: estimate.breakdown,
    warnings: [
      ...estimate.warnings,
      ...sourceAvailability
        .filter((source) => !source.available)
        .map((source) => `${source.source}: ${source.reason || 'Source is not currently available.'}`),
    ],
    sourceAvailability,
    currentBalance: credits.balance,
    canAfford: credits.balance >= estimate.estimatedTotal,
    trustedForCharge: false,
  }, 'Search credit estimate calculated.');
});
