import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { creditsHistory, creditsSummary } from './credit.controller.js';
import { creditHistoryQuerySchema } from './credit.schemas.js';

export const creditRouter = Router();

creditRouter.use(requireAuth);
creditRouter.get('/', creditsSummary);
creditRouter.get('/history', validate(creditHistoryQuerySchema), creditsHistory);
