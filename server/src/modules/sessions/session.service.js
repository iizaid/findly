import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { createSessionToken, hashSessionToken } from '../../utils/crypto.js';

const msPerDay = 24 * 60 * 60 * 1000;

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.IS_PRODUCTION,
  path: '/',
  maxAge: env.SESSION_TTL_DAYS * msPerDay,
};

export const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.IS_PRODUCTION,
  path: '/',
};

const sessionExpiry = () => new Date(Date.now() + env.SESSION_TTL_DAYS * msPerDay);

const pruneOldActiveSessions = async (userId, keepSessionId) => {
  const activeSessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
      NOT: {
        id: keepSessionId,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
    },
  });

  const sessionsToRevoke = activeSessions.slice(Math.max(env.MAX_ACTIVE_SESSIONS - 1, 0));

  if (sessionsToRevoke.length === 0) return;

  await prisma.session.updateMany({
    where: {
      id: {
        in: sessionsToRevoke.map((session) => session.id),
      },
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const createSession = async ({ userId, userAgent, ipAddress }) => {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      userAgent,
      ipAddress,
      expiresAt: sessionExpiry(),
    },
  });

  await pruneOldActiveSessions(userId, session.id);

  return { token, session };
};

export const getActiveSessionByToken = async (token) => {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);

  return prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
};

export const revokeSession = async (sessionId, userId) => {
  return prisma.session.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const listUserSessions = async (userId) => {
  return prisma.session.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
};
