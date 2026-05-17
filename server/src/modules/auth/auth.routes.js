import { Router } from 'express';
import { requireAuth, attachOptionalAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter, loginRateLimiter, passwordResetRateLimiter, signupRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { emptyAuthBodySchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, updatePasswordSchema, verifyEmailSchema } from './auth.schemas.js';
import { forgotPassword, login, logout, me, register, resendVerification, resetPassword, verifyEmail, updatePassword, logoutEverywhere } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.post('/verify-email', authRateLimiter, attachOptionalAuth, validate(verifyEmailSchema), verifyEmail);
authRouter.post('/resend-verification', authRateLimiter, requireAuth, validate(emptyAuthBodySchema), resendVerification);
authRouter.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), forgotPassword);
authRouter.post('/reset-password', passwordResetRateLimiter, validate(resetPasswordSchema), resetPassword);

authRouter.post('/logout', requireAuth, logout);
authRouter.post('/logout-everywhere', requireAuth, validate(emptyAuthBodySchema), logoutEverywhere);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/password', requireAuth, validate(updatePasswordSchema), updatePassword);
