import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter, loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { emptyAuthBodySchema, loginSchema, registerSchema, verifyEmailSchema } from './auth.schemas.js';
import { login, logout, me, register, resendVerification, verifyEmail } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.post('/verify-email', authRateLimiter, validate(verifyEmailSchema), verifyEmail);
authRouter.use(authRateLimiter);
authRouter.post('/logout', requireAuth, logout);
authRouter.post('/resend-verification', requireAuth, validate(emptyAuthBodySchema), resendVerification);
authRouter.get('/me', requireAuth, me);
