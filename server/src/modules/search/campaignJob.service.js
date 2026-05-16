import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { releaseSearchCreditReservation } from '../credits/credit.service.js';

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

export const updateCampaignProgress = ({ tx = prisma, campaignId, progressCurrent, progressTotal, lastStep }) => tx.searchCampaign.update({
  where: { id: campaignId },
  data: {
    ...(Number.isInteger(progressCurrent) ? { progressCurrent } : {}),
    ...(Number.isInteger(progressTotal) ? { progressTotal } : {}),
    ...(lastStep ? { lastStep } : {}),
  },
});

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

export const markCampaignCancelled = async ({ tx = prisma, campaignId, userId, errorMessage = 'Campaign was cancelled.' }) => {
  return tx.searchCampaign.updateMany({
    where: {
      id: campaignId,
      userId,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    data: {
      status: 'CANCELLED',
      failedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      errorCode: 'JOB_CANCELLED',
      errorMessage,
      creditsReserved: 0,
      lastStep: 'Cancelled',
    },
  });
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
  const campaigns = await prisma.searchCampaign.findMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: staleBefore },
    },
    select: { id: true, userId: true },
    take: 200,
  });

  let count = 0;
  for (const campaign of campaigns) {
    const updated = await prisma.$transaction(async (tx) => {
      await releaseSearchCreditReservation({ tx, userId: campaign.userId, campaignId: campaign.id });
      return tx.searchCampaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          creditsReserved: 0,
          errorCode: errorCodes.CAMPAIGN_NOT_RUNNABLE,
          errorMessage: 'Campaign was marked failed because it stayed running past the stale job timeout.',
          lastStep: 'Stale run cleanup',
        },
      });
    });
    count += updated.count;
  }

  return { count };
};

export const cleanupStaleQueuedCampaigns = async () => {
  const staleBefore = new Date(Date.now() - env.JOB_STALE_TIMEOUT_MINUTES * 60 * 1000);
  const campaigns = await prisma.searchCampaign.findMany({
    where: { status: 'QUEUED' },
    select: {
      id: true,
      userId: true,
      updatedAt: true,
      jobs: {
        where: { type: 'SEARCH_CAMPAIGN_RUN' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          errorCode: true,
          errorMessage: true,
        },
      },
    },
    take: 200,
  });

  let count = 0;
  for (const campaign of campaigns) {
    const latestJob = campaign.jobs?.[0] || null;
    const jobIsTerminal = latestJob && ['FAILED', 'CANCELLED'].includes(latestJob.status);
    const jobIsStaleQueued = latestJob?.status === 'QUEUED' && latestJob.createdAt < staleBefore;
    const missingJobIsStale = !latestJob && campaign.updatedAt < staleBefore;

    if (!jobIsTerminal && !jobIsStaleQueued && !missingJobIsStale) continue;

    const updated = await prisma.$transaction(async (tx) => {
      await releaseSearchCreditReservation({
        tx,
        userId: campaign.userId,
        campaignId: campaign.id,
        status: latestJob?.status === 'CANCELLED' ? 'CANCELLED' : 'RELEASED',
      });
      return tx.searchCampaign.updateMany({
        where: { id: campaign.id, status: 'QUEUED' },
        data: {
          status: latestJob?.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          failedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          creditsReserved: 0,
          errorCode: latestJob?.errorCode || errorCodes.CAMPAIGN_NOT_RUNNABLE,
          errorMessage: latestJob?.errorMessage || 'Campaign was marked failed because its queued job did not start.',
          lastStep: latestJob?.status === 'CANCELLED' ? 'Cancelled' : 'Stale queued cleanup',
        },
      });
    });
    count += updated.count;
  }

  return { count };
};
