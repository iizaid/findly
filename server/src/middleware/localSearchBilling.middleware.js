import { prisma } from '../db/prisma.js';
import { estimateSearchCreditReservation } from '../modules/credits/credit.service.js';
import { getRunnableAdapter } from '../modules/search/source.registry.js';

const LOCAL_SOURCES = ['LOCAL_DATASET', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'DATASET_IMPORT', 'MANUAL_ADMIN'];
const DATASET_BACKED_SOURCES = ['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP', 'SERPAPI', 'TRIPADVISOR', 'YOUTUBE', 'X', 'LINKEDIN', 'TIKTOK'];

export const billDatasetBackedSearch = async (req, _res, next) => {
  try {
    const campaignId = req.validated?.params?.id || req.params?.id;
    const campaign = await prisma.searchCampaign.findFirst({
      where: { id: campaignId, userId: req.user.id },
      select: { id: true, name: true, workspaceId: true, sources: true, requestedLimit: true },
    });

    if (!campaign) return next();

    const sources = campaign.sources || [];
    const localRequested = sources.some((source) => LOCAL_SOURCES.includes(source));
    const backedRequested = sources.some((source) => DATASET_BACKED_SOURCES.includes(source));
    const unavailable = sources.map((source) => ({ source, ...getRunnableAdapter(source) })).find((source) => !source.runnable);
    const usesDataset = localRequested || (backedRequested && unavailable);

    if (!usesDataset) return next();

    req.billing = {
      ...(req.billing || {}),
      datasetSearch: {
        estimatedMaxCredits: estimateSearchCreditReservation({ requestedLimit: campaign.requestedLimit || 20 }),
        balanceAfter: null,
      },
    };
    return next();
  } catch (error) {
    return next(error);
  }
};
