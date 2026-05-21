import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import { clearCookieOptions, getCookieOptions } from '../sessions/session.service.js';
import { loginUser, logoutUser, registerUser, updatePassword as updatePasswordService, logoutEverywhere as logoutEverywhereService } from './auth.service.js';
import { resendVerificationEmail, verifyEmailToken } from './emailVerification.service.js';
import { PASSWORD_RESET_GENERIC_MESSAGE, requestPasswordReset, resetPasswordWithToken } from './passwordReset.service.js';
import {
  cancelTwoFactorLoginChallenge,
  clearTwoFactorChallengeCookieOptions,
  completeTwoFactorLogin,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateTwoFactorBackupCodes,
  startTwoFactorSetup,
} from './twoFactor.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.validated.body, req);

  res.cookie(env.COOKIE_NAME, result.token, getCookieOptions(true));

  return successResponse(
    res,
    {
      user: result.user,
      workspace: result.workspace,
      requiresEmailVerification: result.requiresEmailVerification,
      emailSent: result.emailSent,
    },
    'Account created. Check your email to verify your account.',
    201,
  );
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.validated.body, req);

  if (result.requiresTwoFactor) {
    return successResponse(
      res,
      {
        requiresTwoFactor: true,
        challengeToken: result.challengeToken,
        expiresAt: result.expiresAt,
      },
      'Two-factor authentication required.',
    );
  }

  const workspace = await getDefaultWorkspace(result.user.id);
  const remember = req.validated.body.remember ?? true;

  res.cookie(env.COOKIE_NAME, result.token, getCookieOptions(remember));

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
  
  const isAuthenticated = Boolean(req.user && req.user.id === result.user.id);

  return successResponse(
    res,
    {
      user: result.user,
      workspace: result.workspace,
      alreadyVerified: result.alreadyVerified,
      creditsGranted: result.creditsGranted,
      authenticated: isAuthenticated,
      nextAction: isAuthenticated ? 'ENTER_DASHBOARD' : 'LOGIN_REQUIRED',
    },
    result.alreadyVerified ? 'Email is already verified.' : 'Email verified successfully.',
  );
});

export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;

  await updatePasswordService(req.user.id, currentPassword, newPassword, { currentSessionId: req.session?.id, req });
  return successResponse(res, {}, 'Password updated successfully.');
});

export const logoutEverywhere = asyncHandler(async (req, res) => {
  await logoutEverywhereService(req.user.id);
  res.clearCookie(env.COOKIE_NAME, clearCookieOptions);
  return successResponse(res, {}, 'Logged out from all devices successfully.');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await requestPasswordReset(req.validated.body, req);
  return successResponse(res, {}, PASSWORD_RESET_GENERIC_MESSAGE);
});

export const resetPassword = asyncHandler(async (req, res) => {
  await resetPasswordWithToken(req.validated.body, req);
  res.clearCookie(env.COOKIE_NAME, clearCookieOptions);
  return successResponse(res, {}, 'Password reset successfully. Please log in again.');
});

export const getTwoFactor = asyncHandler(async (req, res) => {
  const status = await getTwoFactorStatus(req.user.id);
  return successResponse(res, status, 'Two-factor status loaded.');
});

export const startTwoFactor = asyncHandler(async (req, res) => {
  const result = await startTwoFactorSetup({ userId: req.user.id, req });
  return successResponse(res, result, 'Two-factor setup started.');
});

export const confirmTwoFactor = asyncHandler(async (req, res) => {
  const result = await confirmTwoFactorSetup({ userId: req.user.id, code: req.validated.body.code, req });
  return successResponse(res, result, 'Two-factor authentication enabled.');
});

export const disableTwoFactorForCurrentUser = asyncHandler(async (req, res) => {
  await disableTwoFactor({
    userId: req.user.id,
    password: req.validated.body.password,
    code: req.validated.body.code,
    req,
  });
  return successResponse(res, {}, 'Two-factor authentication disabled.');
});

export const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const result = await regenerateTwoFactorBackupCodes({
    userId: req.user.id,
    code: req.validated.body.code,
    req,
  });
  return successResponse(res, result, 'Backup codes regenerated.');
});

export const verifyTwoFactorLogin = asyncHandler(async (req, res) => {
  const cookieChallengeToken = req.cookies?.[env.TWO_FACTOR_CHALLENGE_COOKIE_NAME];
  const challengeToken = req.validated.body.challengeToken || cookieChallengeToken;
  let result;

  try {
    result = await completeTwoFactorLogin({
      challengeToken,
      code: req.validated.body.code,
      req,
    });
  } catch (error) {
    if (cookieChallengeToken && ['TWO_FACTOR_CHALLENGE_INVALID', 'TWO_FACTOR_NOT_ENABLED', 'RATE_LIMITED'].includes(error?.code)) {
      res.clearCookie(env.TWO_FACTOR_CHALLENGE_COOKIE_NAME, clearTwoFactorChallengeCookieOptions);
    }
    throw error;
  }

  const workspace = await getDefaultWorkspace(result.user.id);
  res.cookie(env.COOKIE_NAME, result.token, getCookieOptions(result.remember ?? true));
  if (cookieChallengeToken) {
    res.clearCookie(env.TWO_FACTOR_CHALLENGE_COOKIE_NAME, clearTwoFactorChallengeCookieOptions);
  }

  return successResponse(
    res,
    {
      user: result.user,
      workspace,
      returnTo: result.returnTo,
    },
    'Logged in successfully.',
  );
});

export const cancelTwoFactorLogin = asyncHandler(async (req, res) => {
  const cookieChallengeToken = req.cookies?.[env.TWO_FACTOR_CHALLENGE_COOKIE_NAME];
  await cancelTwoFactorLoginChallenge({
    challengeToken: req.validated.body.challengeToken || cookieChallengeToken,
    req,
  });
  if (cookieChallengeToken) {
    res.clearCookie(env.TWO_FACTOR_CHALLENGE_COOKIE_NAME, clearTwoFactorChallengeCookieOptions);
  }
  return successResponse(res, {}, 'Two-factor login cancelled.');
});
