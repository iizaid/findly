import { prisma } from '../../db/prisma.js';
import { successResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { enqueueGeoEnrichmentJob, resolveAccessibleLeadTargets } from './geoEnrichment.service.js';
import { getLeadMapData } from './leadMap.service.js';
import { assertGeoRuntimeReady } from './geoReadiness.service.js';

const parseLeadIds = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

export const getLeadMap = asyncHandler(async (req, res) => {
  await assertGeoRuntimeReady();
  const leadIds = parseLeadIds(req.validated.query.leadIds);
  const listId = req.validated.query.listId || null;
  const result = await getLeadMapData({
    userId: req.user.id,
    leadIds,
    listId,
  });
  return successResponse(res, result, 'Lead map loaded.');
});

export const createLeadMapEnrichmentJob = asyncHandler(async (req, res) => {
  await assertGeoRuntimeReady();
  const leadIds = [...new Set(req.validated.body.leadIds || [])];
  const listId = req.validated.body.listId || null;

  let workspaceId = req.user.workspaceId || null;
  if (!workspaceId && listId) {
    const list = await prisma.leadList.findFirst({
      where: { id: listId, userId: req.user.id },
      select: { workspaceId: true },
    });
    workspaceId = list?.workspaceId || null;
  }

  if (!workspaceId && leadIds.length) {
    const targets = await resolveAccessibleLeadTargets({ userId: req.user.id, leadIds });
    workspaceId = targets[0]?.workspaceId || null;
  }

  if (!workspaceId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Workspace context is required for geo enrichment.', 400);
  }

  const job = await enqueueGeoEnrichmentJob({
    userId: req.user.id,
    workspaceId,
    leadIds,
    listId,
    forceRefresh: Boolean(req.validated.body.forceRefresh),
  });

  return successResponse(res, {
    job: {
      id: job.id,
      status: job.status,
      type: job.type,
      createdAt: job.createdAt,
    },
  }, 'Geo enrichment job queued.', 202);
});

export const getGeoEnrichmentJob = asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({
    where: {
      id: req.validated.params.id,
      userId: req.user.id,
      type: 'GEO_ENRICHMENT_RUN',
    },
    select: {
      id: true,
      status: true,
      type: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
      errorCode: true,
      errorMessage: true,
      payload: true,
    },
  });

  if (!job) {
    throw new AppError(errorCodes.NOT_FOUND, 'Geo enrichment job not found.', 404);
  }

  return successResponse(res, {
    job: {
      id: job.id,
      status: job.status,
      type: job.type,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      summary: job.payload?.summary || null,
    },
  }, 'Geo enrichment job loaded.');
});
