import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import { clearCookieOptions, cookieOptions } from '../sessions/session.service.js';
import { loginUser, logoutUser, registerUser } from './auth.service.js';
import { resendVerificationEmail, verifyEmailToken } from './emailVerification.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.validated.body, req);

  res.cookie(env.COOKIE_NAME, result.token, cookieOptions);

  return successResponse(
    res,
    {
      user: result.user,
      workspace: result.workspace,
      requiresEmailVerification: result.requiresEmailVerification,
    },
    'Account created. Check your email to verify your account.',
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

export const resendVerification = asyncHandler(async (req, res) => {
  const result = await resendVerificationEmail(req);

  return successResponse(
    res,
    {
      user: result.user,
      alreadyVerified: result.alreadyVerified,
    },
    result.alreadyVerified ? 'Email is already verified.' : 'Verification email sent.',
  );
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const result = await verifyEmailToken(req.validated.body, req);

  return successResponse(
    res,
    {
      user: result.user,
      workspace: result.workspace,
      alreadyVerified: result.alreadyVerified,
      creditsGranted: result.creditsGranted,
      authenticated: false,
    },
    result.alreadyVerified ? 'Email is already verified. Log in to continue.' : 'Email verified successfully. Log in to continue.',
  );
});
