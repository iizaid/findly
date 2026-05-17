import { Router } from 'express';
import { errorResponse, successResponse } from '../../utils/apiResponse.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { errorCodes } from '../../utils/AppError.js';

export const healthRouter = Router();
export const readyRouter = Router();

healthRouter.get('/', (_req, res) => {
  return successResponse(
    res,
    {
      ok: true,
      service: 'findly-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
    },
    'Backend is healthy.',
  );
});

const readyHandler = async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return successResponse(
      res,
      {
        ok: true,
        database: 'ok',
        timestamp: new Date().toISOString(),
      },
      'Backend is ready.',
    );
  } catch {
    return errorResponse(
      res,
      errorCodes.INTERNAL_ERROR,
      'Readiness check failed.',
      503,
    );
  }
};

healthRouter.get('/ready', readyHandler);
readyRouter.get('/', readyHandler);
