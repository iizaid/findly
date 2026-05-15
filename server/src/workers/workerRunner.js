import { closePrisma } from '../db/prisma.js';
import { createSearchWorker } from './searchWorker.js';

const worker = createSearchWorker();
const running = worker.start();

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down Findly worker.`);
  await worker.stop();
  await closePrisma();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await running;
