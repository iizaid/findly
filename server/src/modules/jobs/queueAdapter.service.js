import { env } from '../../config/env.js';
import {
  claimNextJob,
  enqueueJob,
  enqueueJobWithTx,
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
} from './jobQueue.service.js';

export const createPostgresQueueAdapter = () => ({
  driver: 'postgres',
  enqueue: enqueueJob,
  enqueueWithTx: enqueueJobWithTx,
  claimNext: claimNextJob,
  complete: markJobCompleted,
  fail: markJobFailed,
  cancel: markJobCancelled,
});

export const createQueueAdapter = () => {
  if (env.QUEUE_DRIVER === 'redis') {
    // Redis/BullMQ can be wired behind this adapter later. PostgreSQL remains the
    // safe fallback until Redis infrastructure is configured and tested.
    return createPostgresQueueAdapter();
  }

  return createPostgresQueueAdapter();
};
