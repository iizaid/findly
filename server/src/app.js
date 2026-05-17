import cookieParser from 'cookie-parser';
import express from 'express';
import { corsMiddleware } from './config/cors.js';
import { env } from './config/env.js';
import { securityMiddleware } from './config/security.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { requireAllowedOrigin } from './middleware/origin.middleware.js';
import { generalRateLimiter } from './middleware/rateLimit.middleware.js';
import { requestContext } from './middleware/requestContext.middleware.js';
import { requireJsonContentType } from './middleware/requestHardening.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { creditRouter } from './modules/credits/credit.routes.js';
import { csrfRouter } from './modules/csrf/csrf.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { healthRouter, readyRouter } from './modules/health/health.routes.js';
import { jobRouter } from './modules/jobs/job.routes.js';
import { sessionRouter } from './modules/sessions/session.routes.js';
import { sourceRouter } from './modules/sources/source.routes.js';
import { workspaceRouter } from './modules/workspaces/workspace.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import usersRouter from './modules/users/users.routes.js';
import path from 'path';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestContext);
  app.use(securityMiddleware);
  app.use(corsMiddleware);
  app.use(generalRateLimiter);
  app.use(requireAllowedOrigin);
  app.use(requireJsonContentType);
  app.use(express.json({ limit: env.JSON_BODY_LIMIT, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: env.URLENCODED_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  app.use('/api/health', healthRouter);
  app.use('/api/ready', readyRouter);
  app.use('/api/sources', sourceRouter);
  app.use('/api/csrf-token', csrfRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/credits', creditRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/jobs', jobRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/users', usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
