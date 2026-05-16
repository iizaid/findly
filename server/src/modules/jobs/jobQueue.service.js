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

export const enqueueJobWithTx = async (tx, { userId, workspaceId, campaignId = null, type, payload = {}, maxAttempts = 3 }) => {
  return tx.job.create({
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
  const where = { status: 'QUEUED', cancelRequestedAt: null, ...(type ? { type } : {}) };
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
      lastHeartbeatAt: new Date(),
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
      lastHeartbeatAt: new Date(),
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
    lastHeartbeatAt: null,
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
    lastHeartbeatAt: null,
    errorCode,
    errorMessage,
  },
});

export const heartbeatJob = ({ jobId, workerId }) => prisma.job.updateMany({
  where: {
    id: jobId,
    status: 'RUNNING',
    ...(workerId ? { lockedBy: workerId } : {}),
    cancelRequestedAt: null,
  },
  data: {
    lastHeartbeatAt: new Date(),
  },
});

export const requestJobCancellation = ({ jobId }) => prisma.job.updateMany({
  where: {
    id: jobId,
    status: { in: ['QUEUED', 'RUNNING'] },
  },
  data: {
    cancelRequestedAt: new Date(),
  },
});

export const markJobCancelled = ({ jobId, errorMessage = 'Job was cancelled.' }) => prisma.job.update({
  where: { id: jobId },
  data: {
    status: 'CANCELLED',
    failedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastHeartbeatAt: null,
    errorCode: 'JOB_CANCELLED',
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
      lastHeartbeatAt: null,
      cancelRequestedAt: null,
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
      OR: [
        { lastHeartbeatAt: { lt: staleBefore } },
        { lastHeartbeatAt: null, lockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastHeartbeatAt: null,
      errorCode: errorCodes.CAMPAIGN_NOT_RUNNABLE,
      errorMessage: 'Job was marked failed because it stayed running past the stale job timeout.',
    },
  });
};

export const getSearchQueueMetrics = async () => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleBefore = new Date(Date.now() - env.JOB_STALE_TIMEOUT_MINUTES * 60 * 1000);
  const [
    queuedJobs,
    runningJobs,
    failedLast24h,
    completedLast24h,
    oldestQueued,
    staleRunningJobs,
    completedDurations,
  ] = await prisma.$transaction([
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'QUEUED' } }),
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'RUNNING' } }),
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'FAILED', failedAt: { gte: since24h } } }),
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'COMPLETED', completedAt: { gte: since24h } } }),
    prisma.job.findFirst({
      where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.job.count({
      where: {
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'RUNNING',
        OR: [
          { lastHeartbeatAt: { lt: staleBefore } },
          { lastHeartbeatAt: null, lockedAt: { lt: staleBefore } },
        ],
      },
    }),
    prisma.job.findMany({
      where: {
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'COMPLETED',
        startedAt: { not: null },
        completedAt: { gte: since24h },
      },
      select: { startedAt: true, completedAt: true },
      take: 1000,
    }),
  ]);

  const durations = completedDurations
    .map((job) => job.completedAt && job.startedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null)
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((a, b) => a - b);
  const averageJobDurationMs = durations.length
    ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
    : 0;
  const p95Index = durations.length ? Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1) : 0;

  return {
    queuedJobs,
    runningJobs,
    failedJobsLast24h: failedLast24h,
    completedJobsLast24h: completedLast24h,
    averageJobDurationMs,
    p95JobDurationMs: durations[p95Index] || 0,
    oldestQueuedJobAgeMs: oldestQueued ? Date.now() - oldestQueued.createdAt.getTime() : 0,
    stuckJobsCount: staleRunningJobs,
    queueDriver: env.QUEUE_DRIVER,
    workerConcurrency: env.SEARCH_QUEUE_CONCURRENCY,
    maxQueuedSearchJobs: env.MAX_QUEUED_SEARCH_JOBS,
    maxRunningSearchJobs: env.MAX_RUNNING_SEARCH_JOBS,
    maxActiveSearchJobsPerUser: env.MAX_ACTIVE_SEARCH_JOBS_PER_USER,
  };
};

export const getSearchJobBackpressureState = async ({ userId }) => {
  const activeWhere = {
    type: 'SEARCH_CAMPAIGN_RUN',
    status: { in: ['QUEUED', 'RUNNING'] },
  };

  const [queuedCount, runningCount, userActiveCount] = await prisma.$transaction([
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'QUEUED' } }),
    prisma.job.count({ where: { type: 'SEARCH_CAMPAIGN_RUN', status: 'RUNNING' } }),
    prisma.job.count({ where: { ...activeWhere, userId } }),
  ]);

  return { queuedCount, runningCount, userActiveCount };
};
