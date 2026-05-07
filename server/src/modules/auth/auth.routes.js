import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter, loginRateLimiter, signupRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { login, logout, me, register } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', signupRateLimiter, validate(registerSchema), register);
authRouter.post('/login', loginRateLimiter, validate(loginSchema), login);
authRouter.use(authRateLimiter);
authRouter.post('/logout', requireAuth, logout);
authRouter.get('/me', requireAuth, me);
