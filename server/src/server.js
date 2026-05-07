import { env } from './config/env.js';
import { closePrisma } from './db/prisma.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Findly API listening on port ${env.PORT}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down Findly API.`);
  server.close(async () => {
    await closePrisma();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
