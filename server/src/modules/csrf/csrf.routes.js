import { Router } from 'express';
import { env } from '../../config/env.js';
import { csrfCookieOptions } from '../../middleware/csrf.middleware.js';
import { successResponse } from '../../utils/apiResponse.js';
import { createCsrfToken } from '../../utils/crypto.js';

export const csrfRouter = Router();

csrfRouter.get('/', (_req, res) => {
  const csrfToken = createCsrfToken();
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions);

  return successResponse(res, { csrfToken }, 'CSRF token issued.');
});
