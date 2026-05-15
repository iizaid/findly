import { Router } from 'express';
import { requireAuth, attachOptionalAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter, loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { emptyAuthBodySchema, loginSchema, registerSchema, updatePasswordSchema, verifyEmailSchema } from './auth.schemas.js';
import { login, logout, me, register, resendVerification, verifyEmail, updatePassword, logoutEverywhere } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.post('/verify-email', authRateLimiter, attachOptionalAuth, validate(verifyEmailSchema), verifyEmail);
authRouter.post('/resend-verification', authRateLimiter, requireAuth, validate(emptyAuthBodySchema), resendVerification);

authRouter.post('/logout', requireAuth, logout);
authRouter.post('/logout-everywhere', requireAuth, validate(emptyAuthBodySchema), logoutEverywhere);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/password', requireAuth, validate(updatePasswordSchema), updatePassword);
