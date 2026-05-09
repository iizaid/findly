import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const enqueueJob = async ({ userId, workspaceId, campaignId = null, type, payload = {}, maxAttempts = 3 }) => {
  return prisma.job.create({
    data: {
      userId,
      workspaceId,
      campaignId,
      type,
      payload,
      maxAttempts,
      status: 'QUEUED',
    },
  });
};

export const claimNextJob = async ({ workerId = 'api-worker', type = null } = {}) => {
  const where = { status: 'QUEUED', ...(type ? { type } : {}) };
  const job = await prisma.job.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
  });

  if (!job) return null;

  const claimed = await prisma.job.updateMany({
    where: {
      id: job.id,
      status: 'QUEUED',
    },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
    },
  });

  if (claimed.count !== 1) return null;
  return prisma.job.findUnique({ where: { id: job.id } });
};

export const markJobRunning = async ({ jobId, workerId = 'api-worker' }) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  if (!job || !['QUEUED', 'RUNNING'].includes(job.status)) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Job cannot be marked running.', 409);
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'RUNNING',
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      ...(job.status === 'QUEUED' ? { attempts: { increment: 1 } } : {}),
    },
  });

  if (!updated) {
    throw new AppError(errorCodes.JOB_ALREADY_RUNNING, 'Job cannot be marked running.', 409);
  }
};

export const markJobCompleted = ({ jobId, payload = null }) => prisma.job.update({
  where: { id: jobId },
  data: {
    status: 'COMPLETED',
    completedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    ...(payload ? { payload } : {}),
  },
});

export const markJobFailed = ({ jobId, errorCode, errorMessage }) => prisma.job.update({
  where: { id: jobId },
  data: {
    status: 'FAILED',
    failedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    errorCode,
    errorMessage,
  },
});

export const retryJobIfAllowed = async ({ jobId }) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!job) {
    throw new AppError(errorCodes.NOT_FOUND, 'Job not found.', 404);
  }

  if (job.status !== 'FAILED') {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Only failed jobs can be retried.', 400);
  }

  if (job.attempts >= job.maxAttempts) {
    throw new AppError(errorCodes.CAMPAIGN_NOT_RUNNABLE, 'Job has reached the maximum retry count.', 409);
  }

  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'QUEUED',
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });
};

export const cleanupStaleJobs = () => {
  const staleBefore = new Date(Date.now() - env.JOB_STALE_TIMEOUT_MINUTES * 60 * 1000);
  return prisma.job.updateMany({
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
      errorMessage: 'Job was marked failed because it stayed running past the stale job timeout.',
    },
  });
};
