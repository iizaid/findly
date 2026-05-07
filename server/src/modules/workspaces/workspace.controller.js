import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { getWorkspaceForUser, listUserWorkspaces } from './workspace.service.js';

export const listWorkspaces = asyncHandler(async (req, res) => {
  const workspaces = await listUserWorkspaces(req.user.id);

  return successResponse(res, { workspaces }, 'Workspaces loaded.');
});

export const getWorkspace = asyncHandler(async (req, res) => {
  const workspace = await getWorkspaceForUser(req.validated.params.id, req.user.id);

  return successResponse(res, { workspace }, 'Workspace loaded.');
});
