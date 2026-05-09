import { Router } from 'express';
import { successResponse } from '../../utils/apiResponse.js';
import { getSourceStatusesWithRuntime } from '../search/source.service.js';

export const sourceRouter = Router();

sourceRouter.get('/status', async (_req, res) => {
  const sources = await getSourceStatusesWithRuntime();
  return successResponse(res, { sources }, 'Source statuses loaded.');
});
