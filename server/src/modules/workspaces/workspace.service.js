import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const listUserWorkspaces = async (userId) => {
  return prisma.workspace.findMany({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      members: {
        where: { userId },
        select: {
          role: true,
          createdAt: true,
        },
      },
    },
  });
};

export const getDefaultWorkspace = async (userId) => {
  return prisma.workspace.findFirst({
    where: {
      members: {
        some: {
          userId,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const getWorkspaceForUser = async (workspaceId, userId) => {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      members: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!workspace) {
    throw new AppError(errorCodes.NOT_FOUND, 'Workspace not found.', 404);
  }

  return workspace;
};

export const updateWorkspace = async (workspaceId, userId, data) => {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId }
  });

  if (!member || member.role !== 'OWNER') {
    throw new AppError(errorCodes.FORBIDDEN, 'Only workspace owners can update settings.', 403);
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: data.name },
    select: { id: true, ownerId: true, name: true, createdAt: true, updatedAt: true }
  });
};
