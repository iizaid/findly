import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getCreditHistory, getCreditsSummary } from './credit.service.js';

export const creditsSummary = asyncHandler(async (req, res) => {
  const credits = await getCreditsSummary(req.user.id);

  return successResponse(res, { credits }, 'Credits loaded.');
});

export const creditsHistory = asyncHandler(async (req, res) => {
  const ledger = await getCreditHistory(req.user.id, req.validated.query);

  return successResponse(res, { ledger }, 'Credit history loaded.');
});
