import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { prisma } from '../../db/prisma.js';
import { successResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const jobRouter = Router();

const jobIdSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

jobRouter.use(requireAuth, requireVerifiedEmail);

jobRouter.get('/:id', validate(jobIdSchema), asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({
    where: {
      id: req.validated.params.id,
      userId: req.user.id,
    },
    select: {
      id: true,
      campaignId: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      errorCode: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job) {
    throw new AppError(errorCodes.NOT_FOUND, 'Job not found.', 404);
  }

  return successResponse(res, { job }, 'Job loaded.');
}));
