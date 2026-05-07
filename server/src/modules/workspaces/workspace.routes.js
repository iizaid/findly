import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { getWorkspace, listWorkspaces } from './workspace.controller.js';
import { workspaceIdParamSchema } from './workspace.schemas.js';

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);
workspaceRouter.get('/', listWorkspaces);
workspaceRouter.get('/:id', validate(workspaceIdParamSchema), getWorkspace);
