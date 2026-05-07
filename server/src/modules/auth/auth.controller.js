import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import { clearCookieOptions, cookieOptions } from '../sessions/session.service.js';
import { loginUser, logoutUser, registerUser } from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.validated.body, req);

  res.cookie(env.COOKIE_NAME, result.token, cookieOptions);

  return successResponse(
    res,
    {
      user: result.user,
      workspace: result.workspace,
    },
    'Account created successfully.',
    201,
  );
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.validated.body, req);
  const workspace = await getDefaultWorkspace(result.user.id);

  res.cookie(env.COOKIE_NAME, result.token, cookieOptions);

  return successResponse(
    res,
    {
      user: result.user,
      workspace,
    },
    'Logged in successfully.',
  );
});

export const logout = asyncHandler(async (req, res) => {
  await logoutUser(req);
  res.clearCookie(env.COOKIE_NAME, clearCookieOptions);

  return successResponse(res, {}, 'Logged out successfully.');
});

export const me = asyncHandler(async (req, res) => {
  const workspace = await getDefaultWorkspace(req.user.id);

  return successResponse(
    res,
    {
      user: req.user,
      workspace,
    },
    'Current user loaded.',
  );
});
