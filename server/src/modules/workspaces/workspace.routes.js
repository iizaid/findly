import { Router } from 'express';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { getWorkspace, listWorkspaces, updateWorkspaceHandler } from './workspace.controller.js';
import { updateWorkspaceSchema, workspaceIdParamSchema } from './workspace.schemas.js';

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);
workspaceRouter.get('/', listWorkspaces);
workspaceRouter.get('/:id', validate(workspaceIdParamSchema), getWorkspace);
workspaceRouter.patch('/:id', requireVerifiedEmail, validate(updateWorkspaceSchema), updateWorkspaceHandler);
