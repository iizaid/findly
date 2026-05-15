import { env } from './config/env.js';
import { closePrisma } from './db/prisma.js';
import { createApp } from './app.js';
import { createSearchWorker } from './workers/searchWorker.js';

const app = createApp();
const worker = env.ENABLE_WORKER ? createSearchWorker() : null;
const workerRun = worker ? worker.start() : null;

const server = app.listen(env.PORT, () => {
  console.log(`Findly API listening on port ${env.PORT}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down Findly API.`);
  if (worker) {
    await worker.stop();
  }
  server.close(async () => {
    if (workerRun) {
      await Promise.race([workerRun, new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
    await closePrisma();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
