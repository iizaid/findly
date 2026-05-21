import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, attachOptionalAuth } from '../../middleware/auth.middleware.js';
import {
  authRateLimiter,
  loginRateLimiter,
  oauthCallbackRateLimiter,
  oauthStartRateLimiter,
  passwordResetRateLimiter,
  signupRateLimiter,
  twoFactorBackupRegenerateRateLimiter,
  twoFactorDisableRateLimiter,
  twoFactorLoginVerifyRateLimiter,
  twoFactorSetupConfirmRateLimiter,
  twoFactorSetupStartRateLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  emptyAuthBodySchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  twoFactorConfirmSchema,
  twoFactorDisableSchema,
  twoFactorLoginCancelSchema,
  twoFactorLoginVerifySchema,
  updatePasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import {
  cancelTwoFactorLogin,
  confirmTwoFactor,
  disableTwoFactorForCurrentUser,
  forgotPassword,
  getTwoFactor,
  login,
  logout,
  logoutEverywhere,
  me,
  regenerateBackupCodes,
  register,
  resendVerification,
  resetPassword,
  startTwoFactor,
  updatePassword,
  verifyEmail,
  verifyTwoFactorLogin,
} from './auth.controller.js';
import { handleOAuthCallback, startOAuth } from './oauth.controller.js';
import { oauthCallbackSchema, oauthStartSchema } from './oauth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.post('/verify-email', authRateLimiter, attachOptionalAuth, validate(verifyEmailSchema), verifyEmail);
authRouter.post('/resend-verification', authRateLimiter, requireAuth, validate(emptyAuthBodySchema), resendVerification);
authRouter.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), forgotPassword);
authRouter.post('/reset-password', passwordResetRateLimiter, validate(resetPasswordSchema), resetPassword);
authRouter.post('/2fa/login/verify', twoFactorLoginVerifyRateLimiter, validate(twoFactorLoginVerifySchema), verifyTwoFactorLogin);
authRouter.post('/2fa/login/cancel', authRateLimiter, validate(twoFactorLoginCancelSchema), cancelTwoFactorLogin);
authRouter.get('/oauth/:provider/start', oauthStartRateLimiter, validate(oauthStartSchema), startOAuth);
authRouter.get('/oauth/:provider/callback', oauthCallbackRateLimiter, validate(oauthCallbackSchema), handleOAuthCallback);

authRouter.post('/logout', requireAuth, logout);
authRouter.post('/logout-everywhere', requireAuth, validate(emptyAuthBodySchema), logoutEverywhere);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/password', requireAuth, validate(updatePasswordSchema), updatePassword);
authRouter.get('/2fa/status', requireAuth, requireVerifiedEmail, getTwoFactor);
authRouter.post('/2fa/setup/start', requireAuth, requireVerifiedEmail, twoFactorSetupStartRateLimiter, validate(emptyAuthBodySchema), startTwoFactor);
authRouter.post('/2fa/setup/confirm', requireAuth, requireVerifiedEmail, twoFactorSetupConfirmRateLimiter, validate(twoFactorConfirmSchema), confirmTwoFactor);
authRouter.post('/2fa/disable', requireAuth, requireVerifiedEmail, twoFactorDisableRateLimiter, validate(twoFactorDisableSchema), disableTwoFactorForCurrentUser);
authRouter.post('/2fa/backup-codes/regenerate', requireAuth, requireVerifiedEmail, twoFactorBackupRegenerateRateLimiter, validate(twoFactorConfirmSchema), regenerateBackupCodes);
