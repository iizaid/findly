import { Router } from 'express';
import { requireAuth, attachOptionalAuth } from '../../middleware/auth.middleware.js';
import {
  authRateLimiter,
  loginRateLimiter,
  oauthCallbackRateLimiter,
  oauthStartRateLimiter,
  passwordResetRateLimiter,
  signupRateLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { emptyAuthBodySchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updatePasswordSchema, verifyEmailSchema } from './auth.schemas.js';
import { forgotPassword, login, logout, me, register, resendVerification, resetPassword, verifyEmail, updatePassword, logoutEverywhere } from './auth.controller.js';
import { handleOAuthCallback, startOAuth } from './oauth.controller.js';
import { oauthCallbackSchema, oauthStartSchema } from './oauth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.post('/verify-email', authRateLimiter, attachOptionalAuth, validate(verifyEmailSchema), verifyEmail);
authRouter.post('/resend-verification', authRateLimiter, requireAuth, validate(emptyAuthBodySchema), resendVerification);
authRouter.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), forgotPassword);
authRouter.post('/reset-password', passwordResetRateLimiter, validate(resetPasswordSchema), resetPassword);
authRouter.get('/oauth/:provider/start', oauthStartRateLimiter, validate(oauthStartSchema), startOAuth);
authRouter.get('/oauth/:provider/callback', oauthCallbackRateLimiter, validate(oauthCallbackSchema), handleOAuthCallback);

authRouter.post('/logout', requireAuth, logout);
authRouter.post('/logout-everywhere', requireAuth, validate(emptyAuthBodySchema), logoutEverywhere);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/password', requireAuth, validate(updatePasswordSchema), updatePassword);
