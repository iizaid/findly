import { AppError, errorCodes } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { runCampaign } from '../search/search.service.js';
import { claimNextJob, markJobCompleted, markJobFailed } from './jobQueue.service.js';

export const processJob = async (job) => {
  if (!job) return null;

  try {
    if (job.type === 'SEARCH_CAMPAIGN_RUN') {
      if (!job.campaignId) {
        throw new AppError(errorCodes.VALIDATION_ERROR, 'Search campaign job is missing campaignId.', 400);
      }

      return runCampaign(job.campaignId, job.userId, { jobId: job.id });
    }

    throw new AppError(errorCodes.VALIDATION_ERROR, `Unsupported job type: ${job.type}.`, 400);
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR;
    const errorMessage = error instanceof AppError ? error.message : 'Job failed safely.';

    await markJobFailed({
      jobId: job.id,
      errorCode,
      errorMessage,
    }).catch(() => {});

    logger.warn('job.process.failed', { jobId: job.id, type: job.type, errorCode });
    throw error;
  }
};

export const runNextJob = async ({ workerId = 'db-worker', type = null } = {}) => {
  const job = await claimNextJob({ workerId, type });
  if (!job) return null;

  const result = await processJob(job);
  if (job.type !== 'SEARCH_CAMPAIGN_RUN') {
    await markJobCompleted({ jobId: job.id, payload: { result: true } });
  }

  return result;
};
