import { env } from '../config/env.js';
import { AppError, errorCodes } from '../utils/AppError.js';

const METHODS_WITH_SIDE_EFFECTS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const requireAllowedOrigin = (req, _res, next) => {
  if (!METHODS_WITH_SIDE_EFFECTS.has(req.method)) return next();

  const origin = normalizeOrigin(req.get('origin'));
  const referer = normalizeOrigin(req.get('referer'));
  const requestOrigin = origin || referer;

  // Non-browser clients may omit both headers. In production, reject them for
  // cookie-authenticated state-changing requests because they cannot prove origin.
  if (!requestOrigin) {
    if (env.IS_PRODUCTION) {
      return next(new AppError(errorCodes.FORBIDDEN, 'Request origin is required.', 403));
    }
    return next();
  }

  if (!env.CLIENT_ORIGINS.includes(requestOrigin)) {
    return next(new AppError(errorCodes.FORBIDDEN, 'Request origin is not allowed.', 403));
  }

  return next();
};
