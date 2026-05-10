import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { getActiveSessionByToken } from '../modules/sessions/session.service.js';
import { toSafeUser } from '../modules/users/user.mapper.js';
import { AppError, errorCodes } from '../utils/AppError.js';

export const requireAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      throw new AppError(errorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }

    const session = await getActiveSessionByToken(token);

    if (!session) {
      throw new AppError(errorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }

    req.session = {
      id: session.id,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
    req.user = toSafeUser(session.user);
    req.userRecord = session.user;

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireVerifiedEmail = async (req, _res, next) => {
  try {
    if (!req.user?.emailVerified) {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: 'DASHBOARD_ACCESS_DENIED_UNVERIFIED',
          entityType: 'User',
          entityId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
        },
      });

      throw new AppError(errorCodes.EMAIL_NOT_VERIFIED, 'Verify your email to continue.', 403);
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireAdmin = async (req, _res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: 'ADMIN_ACCESS_DENIED',
          entityType: 'User',
          entityId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
        },
      }).catch(() => {});

      throw new AppError(errorCodes.FORBIDDEN, 'Admin access required.', 403);
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Silently attaches req.user, req.userRecord, and req.session if a valid
 * session cookie is present. Always calls next() — never blocks the request.
 * Use on routes that work for both authenticated and unauthenticated users.
 */
export const attachOptionalAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];
    if (token) {
      const session = await getActiveSessionByToken(token);
      if (session) {
        req.session = {
          id: session.id,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
        };
        req.user = toSafeUser(session.user);
        req.userRecord = session.user;
      }
    }
  } catch {
    // Intentionally swallow errors — optional auth must never block the request.
  }
  return next();
};
