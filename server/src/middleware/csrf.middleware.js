import { env } from '../config/env.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { verifyCsrfToken } from '../utils/crypto.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/2fa/login/verify',
  '/api/auth/2fa/login/cancel',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/csrf-token',
]);

const getCsrfCookieOptions = () => {
  const options = {
    httpOnly: false, // Needs to be false so frontend can read it
    sameSite: env.CSRF_COOKIE_SAME_SITE,
    secure: env.CSRF_COOKIE_SECURE !== undefined ? env.CSRF_COOKIE_SECURE : env.IS_PRODUCTION,
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };

  if (env.CSRF_COOKIE_DOMAIN) {
    options.domain = env.CSRF_COOKIE_DOMAIN;
  }

  if (options.sameSite === 'none' && !options.secure) {
    options.secure = true;
  }

  return options;
};

export const csrfCookieOptions = getCsrfCookieOptions();

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
