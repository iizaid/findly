import { Prisma } from '@prisma/client';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { errorResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../db/prisma.js';

const logBackendError = (req, statusCode, errorCode, message) => {
  if (statusCode < 400) return;
  if (!prisma.backendErrorLog?.create) return;

  prisma.backendErrorLog.create({
    data: {
      requestId: req?.requestId || null,
      userId: req?.user?.id || null,
      route: req?.originalUrl || req?.path || null,
      method: req?.method || null,
      statusCode,
      errorCode,
      message: String(message || 'Request failed.').slice(0, 500),
      ipAddress: req?.ip || null,
      userAgent: req?.get?.('user-agent') || null,
    },
  }).catch(() => {});
};

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(errorCodes.NOT_FOUND, `Route not found: ${req.method} ${req.path}`, 404));
};

export const errorHandler = (err, req, res, _next) => {
  const requestId = req?.requestId;

  if (err?.type === 'entity.parse.failed') {
    logBackendError(req, 400, errorCodes.INVALID_JSON, 'Malformed JSON body.');
    return errorResponse(res, errorCodes.INVALID_JSON, 'Malformed JSON body.', 400);
  }

  if (err?.type === 'entity.too.large') {
    logBackendError(req, 413, errorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large.');
    return errorResponse(res, errorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large.', 413);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      logBackendError(req, 413, errorCodes.PAYLOAD_TOO_LARGE, 'File is too large. Maximum size is 50MB.');
      return errorResponse(res, errorCodes.PAYLOAD_TOO_LARGE, 'File is too large. Maximum size is 50MB.', 413);
    }
    logBackendError(req, 400, errorCodes.VALIDATION_ERROR, err.message || 'File upload error.');
    return errorResponse(res, errorCodes.VALIDATION_ERROR, err.message || 'File upload error.', 400);
  }

  // Multer fileFilter rejections throw a plain Error (not MulterError)
  if (err?.message?.startsWith('Unsupported file type:')) {
    logBackendError(req, 400, errorCodes.VALIDATION_ERROR, 'Only .csv and .xlsx files are supported.');
    return errorResponse(res, errorCodes.VALIDATION_ERROR, 'Only .csv and .xlsx files are supported.', 400);
  }

  if (err instanceof AppError) {
    logBackendError(req, err.statusCode, err.code, err.message);
    return errorResponse(res, err.code, err.message, err.statusCode);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      logBackendError(req, 409, errorCodes.CONFLICT, 'A record with this value already exists.');
      return errorResponse(res, errorCodes.CONFLICT, 'A record with this value already exists.', 409);
    }

    logBackendError(req, 500, errorCodes.INTERNAL_ERROR, 'Database request failed.');
    return errorResponse(res, errorCodes.INTERNAL_ERROR, 'Database request failed.', 500);
  }

  if (err.message === 'Origin is not allowed by CORS') {
    logBackendError(req, 403, errorCodes.FORBIDDEN, 'Origin is not allowed.');
    return errorResponse(res, errorCodes.FORBIDDEN, 'Origin is not allowed.', 403);
  }

  logger.error('request.failed', {
    requestId,
    method: req?.method,
    path: req?.originalUrl,
    errorName: err?.name,
    errorMessage: err?.message,
  });

  if (!env.IS_PRODUCTION) {
    logBackendError(req, 500, errorCodes.INTERNAL_ERROR, err.message || 'Internal server error');
    return res.status(500).json({
      success: false,
      error: {
        code: errorCodes.INTERNAL_ERROR,
        message: err.message || 'Internal server error',
        requestId,
      },
    });
  }

  logBackendError(req, 500, errorCodes.INTERNAL_ERROR, 'Internal server error.');
  return errorResponse(res, errorCodes.INTERNAL_ERROR, 'Internal server error.', 500);
};
