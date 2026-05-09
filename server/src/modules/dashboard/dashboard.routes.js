import { Router } from 'express';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import { getCreditsSummary } from '../credits/credit.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const [workspace, credits] = await Promise.all([
    getDefaultWorkspace(req.user.id),
    getCreditsSummary(req.user.id),
  ]);

  return successResponse(
    res,
    {
      user: req.user,
      workspace,
      credits,
    },
    'Dashboard context loaded.',
  );
}));
