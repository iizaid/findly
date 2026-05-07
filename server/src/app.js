import cookieParser from 'cookie-parser';
import express from 'express';
import { corsMiddleware } from './config/cors.js';
import { env } from './config/env.js';
import { securityMiddleware } from './config/security.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { generalRateLimiter } from './middleware/rateLimit.middleware.js';
import { requireJsonContentType } from './middleware/requestHardening.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { creditRouter } from './modules/credits/credit.routes.js';
import { csrfRouter } from './modules/csrf/csrf.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { sessionRouter } from './modules/sessions/session.routes.js';
import { workspaceRouter } from './modules/workspaces/workspace.routes.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);

  app.use(securityMiddleware);
  app.use(corsMiddleware);
  app.use(generalRateLimiter);
  app.use(requireJsonContentType);
  app.use(express.json({ limit: env.JSON_BODY_LIMIT, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: env.URLENCODED_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.use('/api/health', healthRouter);
  app.use('/api/csrf-token', csrfRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/credits', creditRouter);
  app.use('/api/workspaces', workspaceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
