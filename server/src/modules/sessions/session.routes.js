import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { deleteSession, listSessions } from './session.controller.js';
import { sessionIdParamSchema } from './session.schemas.js';

export const sessionRouter = Router();

sessionRouter.use(requireAuth);
sessionRouter.get('/', listSessions);
sessionRouter.delete('/:id', validate(sessionIdParamSchema), deleteSession);
