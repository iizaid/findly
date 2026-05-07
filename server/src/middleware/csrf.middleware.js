import { env } from '../config/env.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { verifyCsrfToken } from '../utils/crypto.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/register', '/api/auth/login', '/api/csrf-token']);

export const csrfCookieOptions = {
  httpOnly: false,
  sameSite: 'lax',
  secure: env.IS_PRODUCTION,
  path: '/',
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
};

export const csrfProtection = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();

  const headerToken = req.get('x-csrf-token');
  const cookieToken = req.cookies?.[env.CSRF_COOKIE_NAME];

  if (!headerToken || !cookieToken || headerToken !== cookieToken || !verifyCsrfToken(headerToken)) {
    return next(new AppError(errorCodes.CSRF_TOKEN_INVALID, 'Invalid CSRF token.', 403));
  }

  return next();
};
