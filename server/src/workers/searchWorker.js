import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import {
  claimNextJob,
  cleanupStaleJobs,
  heartbeatJob,
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
} from '../modules/jobs/jobQueue.service.js';
import {
  cleanupStaleQueuedCampaigns,
  cleanupStaleRunningCampaigns,
  markCampaignFailed,
} from '../modules/search/campaignJob.service.js';
import { runCampaign } from '../modules/search/search.service.js';
import { GEO_ENRICHMENT_JOB_TYPE, processGeoEnrichmentJob } from '../modules/geo/geoEnrichment.service.js';
import { processWebsiteEnrichmentJob, WEBSITE_ENRICHMENT_JOB_TYPE } from '../modules/search/websiteEnrichmentJob.service.js';
import { LEAD_LIST_ANALYSIS_JOB_TYPE, processLeadListAnalysisJob } from '../modules/search/leadListAnalysisJob.service.js';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const processClaimedSearchJob = async ({ job, workerId }) => {
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

  let heartbeat = null;
  try {
    if (job.cancelRequestedAt) {
      await markJobCancelled({ jobId: job.id });
      return { jobId: job.id, status: 'CANCELLED' };
    }
    heartbeat = setInterval(() => {
      heartbeatJob({ jobId: job.id, workerId }).catch((error) => logger.warn('search_worker.heartbeat_failed', {
        workerId,
        jobId: job.id,
        errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
      }));
    }, Math.max(1000, Math.min(env.WORKER_POLL_INTERVAL_MS * 2, 10000)));

    const result = await runCampaign(campaignId, job.userId, { jobId: job.id });
    clearInterval(heartbeat);
    heartbeat = null;
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
    if (heartbeat) clearInterval(heartbeat);
    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const errorMessage = error instanceof AppError ? error.message : 'Search job failed.';
    if (errorCode === 'JOB_CANCELLED') {
      await markJobCancelled({ jobId: job.id, errorMessage }).catch(() => {});
      return { jobId: job.id, status: 'CANCELLED', errorCode };
    }
    await markCampaignFailed({ campaignId, errorCode, errorMessage }).catch(() => {});
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

export const processNextSearchJob = async ({ workerId = env.WORKER_ID || `search-worker-${randomUUID()}` } = {}) => {
  const job = await claimNextJob({ workerId, type: 'SEARCH_CAMPAIGN_RUN' });
  if (!job) return null;
  return processClaimedSearchJob({ job, workerId });
};

export const processNextWorkerJob = async ({ workerId = env.WORKER_ID || `search-worker-${randomUUID()}` } = {}) => {
  const job = await claimNextJob({ workerId });
  if (!job) return null;

  if (job.type === 'SEARCH_CAMPAIGN_RUN') {
    return processClaimedSearchJob({ job, workerId });
  }

  if (job.type === WEBSITE_ENRICHMENT_JOB_TYPE) {
    const result = await processWebsiteEnrichmentJob({ jobId: job.id, useExistingLock: true });
    logger.info('search_worker.job.completed', {
      workerId,
      jobId: job.id,
      type: job.type,
    });
    return { jobId: job.id, status: 'COMPLETED', result };
  }

  if (job.type === GEO_ENRICHMENT_JOB_TYPE) {
    try {
      const summary = await processGeoEnrichmentJob({ jobId: job.id });
      await markJobCompleted({
        jobId: job.id,
        payload: {
          ...(job.payload || {}),
          summary,
        },
      });
      logger.info('search_worker.job.completed', {
        workerId,
        jobId: job.id,
        type: job.type,
        ...summary,
      });
      return { jobId: job.id, status: 'COMPLETED', result: summary };
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
      const errorMessage = error instanceof AppError ? error.message : 'Geo enrichment job failed.';
      await markJobFailed({ jobId: job.id, errorCode, errorMessage }).catch(() => {});
      logger.warn('search_worker.job.failed', {
        workerId,
        jobId: job.id,
        type: job.type,
        errorCode,
      });
      return { jobId: job.id, status: 'FAILED', errorCode };
    }
  }

  if (job.type === LEAD_LIST_ANALYSIS_JOB_TYPE) {
    try {
      const result = await processLeadListAnalysisJob({ jobId: job.id });
      logger.info('search_worker.job.completed', {
        workerId,
        jobId: job.id,
        type: job.type,
      });
      return { jobId: job.id, status: 'COMPLETED', result };
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
      const errorMessage = error instanceof AppError ? error.message : 'Lead list analysis job failed.';
      await markJobFailed({ jobId: job.id, errorCode, errorMessage }).catch(() => {});
      logger.warn('search_worker.job.failed', {
        workerId,
        jobId: job.id,
        type: job.type,
        errorCode,
      });
      return { jobId: job.id, status: 'FAILED', errorCode };
    }
  }

  await markJobFailed({
    jobId: job.id,
    errorCode: errorCodes.VALIDATION_ERROR,
    errorMessage: `Unsupported job type: ${job.type}.`,
  }).catch(() => {});
  return { jobId: job.id, status: 'FAILED', errorCode: errorCodes.VALIDATION_ERROR };
};

export const createSearchWorker = ({
  workerId = env.WORKER_ID || `search-worker-${randomUUID()}`,
  concurrency = env.MAX_SEARCH_WORKER_CONCURRENCY,
  pollIntervalMs = env.WORKER_POLL_INTERVAL_MS,
} = {}) => {
  let stopped = false;
  const active = new Set();

  const cleanupStaleWork = async () => {
    const [jobs, runningCampaigns, queuedCampaigns] = await Promise.all([
      cleanupStaleJobs(),
      cleanupStaleRunningCampaigns(),
      cleanupStaleQueuedCampaigns(),
    ]);
    if (jobs.count || runningCampaigns.count || queuedCampaigns.count) {
      logger.warn('search_worker.stale_cleanup', {
        workerId,
        staleJobs: jobs.count,
        staleRunningCampaigns: runningCampaigns.count,
        staleQueuedCampaigns: queuedCampaigns.count,
      });
    }
  };

  const launchOne = () => {
    const promise = processNextWorkerJob({ workerId })
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
