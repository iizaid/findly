import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { claimNextJob, cleanupStaleJobs, markJobFailed } from '../modules/jobs/jobQueue.service.js';
import { cleanupStaleRunningCampaigns, markCampaignFailed } from '../modules/search/campaignJob.service.js';
import { runCampaign } from '../modules/search/search.service.js';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const processNextSearchJob = async ({ workerId = env.WORKER_ID || `search-worker-${randomUUID()}` } = {}) => {
  const job = await claimNextJob({ workerId, type: 'SEARCH_CAMPAIGN_RUN' });
  if (!job) return null;

  const startedAt = Date.now();
  const campaignId = job.campaignId || job.payload?.campaignId;

  if (!campaignId) {
    await markJobFailed({
      jobId: job.id,
      errorCode: errorCodes.VALIDATION_ERROR,
      errorMessage: 'Search job is missing a campaign id.',
    });
    return { jobId: job.id, status: 'FAILED' };
  }

  try {
    const result = await runCampaign(campaignId, job.userId, { jobId: job.id });
    logger.info('search_worker.job.completed', {
      workerId,
      jobId: job.id,
      campaignId,
      durationMs: Date.now() - startedAt,
      resultCount: result?.resultCount ?? result?.leadsReturned ?? result?.savedLeadsCount ?? 0,
      creditsUsed: result?.creditsUsed ?? 0,
    });
    return { jobId: job.id, status: 'COMPLETED', result };
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const errorMessage = error instanceof AppError ? error.message : 'Search job failed.';
    if (campaignId) {
      await markCampaignFailed({ campaignId, errorCode, errorMessage }).catch(() => {});
    }
    await markJobFailed({ jobId: job.id, errorCode, errorMessage }).catch(() => {});
    logger.warn('search_worker.job.failed', {
      workerId,
      jobId: job.id,
      campaignId,
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    return { jobId: job.id, status: 'FAILED', errorCode };
  }
};

export const createSearchWorker = ({
  workerId = env.WORKER_ID || `search-worker-${randomUUID()}`,
  concurrency = env.MAX_SEARCH_WORKER_CONCURRENCY,
  pollIntervalMs = env.WORKER_POLL_INTERVAL_MS,
} = {}) => {
  let stopped = false;
  const active = new Set();

  const cleanupStaleWork = async () => {
    const [jobs, campaigns] = await Promise.all([
      cleanupStaleJobs(),
      cleanupStaleRunningCampaigns(),
    ]);
    if (jobs.count || campaigns.count) {
      logger.warn('search_worker.stale_cleanup', {
        workerId,
        staleJobs: jobs.count,
        staleCampaigns: campaigns.count,
      });
    }
  };

  const launchOne = () => {
    const promise = processNextSearchJob({ workerId })
      .catch((error) => {
        logger.error('search_worker.unhandled_job_error', {
          workerId,
          errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
        });
      })
      .finally(() => active.delete(promise));
    active.add(promise);
  };

  const loop = async () => {
    logger.info('search_worker.started', { workerId, concurrency, pollIntervalMs });
    await cleanupStaleWork().catch((error) => logger.warn('search_worker.cleanup_failed', {
      workerId,
      errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
    }));

    while (!stopped) {
      while (!stopped && active.size < concurrency) {
        launchOne();
      }
      await sleep(pollIntervalMs);
    }

    await Promise.allSettled([...active]);
    logger.info('search_worker.stopped', { workerId });
  };

  return {
    workerId,
    start: () => loop(),
    stop: async () => {
      stopped = true;
      await Promise.allSettled([...active]);
    },
  };
};
