import { Router } from 'express';
import { successResponse } from '../../utils/apiResponse.js';
import { prisma } from '../../db/prisma.js';
import { getSourceStatuses } from '../search/source.service.js';

export const healthRouter = Router();
export const readyRouter = Router();

healthRouter.get('/', (_req, res) => {
  return successResponse(
    res,
    {
      status: 'ok',
      service: 'findly-api',
      timestamp: new Date().toISOString(),
    },
    'Backend is healthy.',
  );
});

readyRouter.get('/', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return successResponse(
      res,
      {
        status: 'ready',
        service: 'findly-api',
        database: 'ok',
        sources: getSourceStatuses().map((source) => ({
          key: source.key,
          label: source.label,
          status: source.status,
          configured: source.configured,
          available: source.available,
          comingSoon: source.comingSoon,
          requiresApiKey: source.requiresApiKey,
        })),
        timestamp: new Date().toISOString(),
      },
      'Backend is ready.',
    );
  } catch (error) {
    return next(error);
  }
});
