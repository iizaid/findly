import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { successResponse } from '../../utils/apiResponse.js';
import { listUserSessions, revokeSession } from './session.service.js';

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await listUserSessions(req.user.id);

  return successResponse(
    res,
    {
      sessions,
      currentSessionId: req.session.id,
    },
    'Sessions loaded.',
  );
});

export const deleteSession = asyncHandler(async (req, res) => {
  const { id } = req.validated.params;

  const result = await revokeSession(id, req.user.id);

  if (result.count === 0) {
    throw new AppError(errorCodes.NOT_FOUND, 'Session not found.', 404);
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'SESSION_REVOKED',
      entityType: 'Session',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  });

  return successResponse(res, {}, 'Session revoked.');
});
