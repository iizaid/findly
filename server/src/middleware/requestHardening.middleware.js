import { AppError, errorCodes } from '../utils/AppError.js';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const requireJsonContentType = (req, _res, next) => {
  if (!METHODS_WITH_BODY.has(req.method)) return next();

  const contentLength = Number(req.get('content-length') || 0);
  if (contentLength === 0) return next();

  if (req.is('application/json') || req.is('application/x-www-form-urlencoded')) {
    return next();
  }

  return next(
    new AppError(
      errorCodes.UNSUPPORTED_MEDIA_TYPE,
      'Requests with a body must use application/json.',
      415,
    ),
  );
};
