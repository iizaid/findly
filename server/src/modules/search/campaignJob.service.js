import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const QUEUEABLE_CAMPAIGN_STATUSES = ['DRAFT', 'FAILED', 'CANCELLED'];
export const RUNNABLE_CAMPAIGN_STATUSES = [...QUEUEABLE_CAMPAIGN_STATUSES, 'QUEUED'];

export const markCampaignQueued = async ({ tx = prisma, campaignId, userId, requestedLimit, lockedBy = 'api' }) => {
  const queued = await tx.searchCampaign.updateMany({
    where: {
      id: campaignId,
      userId,
      status: { in: QUEUEABLE_CAMPAIGN_STATUSES },
    },
    data: {
      status: 'QUEUED',
      lockedAt: new Date(),
      lockedBy,
      startedAt: null,
      failedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      progressCurrent: 0,
      progressTotal: requestedLimit,
      lastStep: 'Queued for search',
    },
  });

  if (queued.count !== 1) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Campaign is already queued, running, or cannot be run.', 409);
  }
};

export const markCampaignRunning = async ({ campaignId, userId, requestedLimit, lockedBy = 'api' }) => {
  const locked = await prisma.searchCampaign.updateMany({
    where: {
      id: campaignId,
      userId,
      status: { in: RUNNABLE_CAMPAIGN_STATUSES },
    },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      lockedAt: new Date(),
      lockedBy,
      failedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      progressCurrent: 0,
      progressTotal: requestedLimit,
      lastStep: 'Starting source search',
    },
  });

  if (locked.count !== 1) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Campaign is already running or cannot be run.', 409);
  }
};

export const markCampaignCompleted = async ({ tx, campaignId, savedLeadsCount, creditsUsed, totalProcessed }) => {
  return tx.searchCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      resultCount: savedLeadsCount,
      creditsUsed,
      progressCurrent: totalProcessed,
      progressTotal: totalProcessed,
      lastStep: 'Completed',
    },
  });
};

export const markCampaignFailed = async ({ campaignId, errorCode, errorMessage }) => {
  return prisma.searchCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorCode,
      errorMessage,
      lastStep: 'Failed',
    },
  });
};

export const cleanupStaleRunningCampaigns = async () => {
  const staleBefore = new Date(Date.now() - env.JOB_STALE_TIMEOUT_MINUTES * 60 * 1000);
  return prisma.searchCampaign.updateMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorCode: errorCodes.CAMPAIGN_NOT_RUNNABLE,
      errorMessage: 'Campaign was marked failed because it stayed running past the stale job timeout.',
      lastStep: 'Stale run cleanup',
    },
  });
};
