import { Router } from 'express';
import { successResponse } from '../../utils/apiResponse.js';

export const healthRouter = Router();

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
