import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { errorResponse } from '../utils/apiResponse.js';

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(errorCodes.NOT_FOUND, `Route not found: ${req.method} ${req.path}`, 404));
};

export const errorHandler = (err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return errorResponse(res, errorCodes.INVALID_JSON, 'Malformed JSON body.', 400);
  }

  if (err?.type === 'entity.too.large') {
    return errorResponse(res, errorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large.', 413);
  }

  if (err instanceof AppError) {
    return errorResponse(res, err.code, err.message, err.statusCode);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return errorResponse(res, errorCodes.CONFLICT, 'A record with this value already exists.', 409);
    }

    return errorResponse(res, errorCodes.INTERNAL_ERROR, 'Database request failed.', 500);
  }

  if (err.message === 'Origin is not allowed by CORS') {
    return errorResponse(res, errorCodes.FORBIDDEN, 'Origin is not allowed.', 403);
  }

  if (!env.IS_PRODUCTION) {
    return res.status(500).json({
      success: false,
      error: {
        code: errorCodes.INTERNAL_ERROR,
        message: err.message || 'Internal server error',
      },
    });
  }

  return errorResponse(res, errorCodes.INTERNAL_ERROR, 'Internal server error.', 500);
};
