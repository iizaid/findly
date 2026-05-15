import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { createSession, revokeSession } from '../sessions/session.service.js';
import { toSafeUser } from '../users/user.mapper.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { hashAuditValue, hashPassword, verifyPassword } from '../../utils/crypto.js';
import { sendVerificationForUser } from './emailVerification.service.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUMMY_PASSWORD_HASH = '$2b$10$NLcXp1cWaAG/68QxrfVK0O7GHN3vtnlM8kAOqNtfI/Ki4r2a3Q1bS';
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const requestContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || null,
});

const recordFailedLogin = async ({ tx = prisma, userId = null, email, context }) => {
  const emailHash = hashAuditValue(email);
  const expiresAt = new Date(Date.now() + (env.FAILED_LOGIN_ATTEMPT_TTL_MINUTES || 15) * 60 * 1000);

  // Atomic UPSERT: High-performance rate limiting counter
  const attemptRecord = await tx.failedLoginAttempt.upsert({
    where: {
      ipAddress_emailHash: {
        ipAddress: context.ipAddress || 'unknown',
        emailHash,
      },
    },
    update: {
      attempts: { increment: 1 },
      expiresAt,
    },
    create: {
      ipAddress: context.ipAddress || 'unknown',
      emailHash,
      attempts: 1,
      expiresAt,
    },
  });

  // Log the attempt for security audits (fire and forget, don't await if high load)
  tx.auditLog.create({
    data: {
      userId,
      action: 'FAILED_LOGIN',
      metadata: { emailHash, attempts: attemptRecord.attempts },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  }).catch(() => {});

  const newAttempts = Math.min(attemptRecord.attempts, 10);
  const delayMs = Math.min(150 * newAttempts, 1500);
  if (delayMs > 0) await sleep(delayMs);
};

const clearFailedLogin = async (email, ipAddress) => {
  const emailHash = hashAuditValue(email);
  await prisma.failedLoginAttempt.deleteMany({
    where: {
      ipAddress: ipAddress || 'unknown',
      emailHash,
    },
  }).catch(() => {});
};

export const registerUser = async ({ name, email, password }, req) => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(errorCodes.CONFLICT, 'An account with this email already exists.', 409);
  }

  const passwordHash = await hashPassword(password);
  const context = requestContext(req);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        creditsBalance: 0,
        emailVerified: false,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        ownerId: user.id,
        name: `${name}'s workspace`,
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          emailVerified: false,
          initialCreditsGranted: false,
          workspaceId: workspace.id,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return { user, workspace };
  });

  let emailSent = true;
  try {
    await sendVerificationForUser({
      user: result.user,
      req,
      tx: prisma,
      resend: false,
    });
  } catch (err) {
    // Log safely, don't fail registration
    console.error('Failed to send verification email during signup:', err.message);
    
    // Use an isolated transaction/query so it doesn't rollback user creation if the parent is done
    await prisma.auditLog.create({
      data: {
        userId: result.user.id,
        action: 'EMAIL_VERIFICATION_SEND_FAILED',
        entityType: 'User',
        entityId: result.user.id,
        metadata: {
          error: 'SMTP error occurred. Account created successfully but email not sent.',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }).catch(() => {});
    
    emailSent = false;
  }

  const sessionResult = await createSession({
    userId: result.user.id,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    remember: true, // signup default
  });

  return {
    token: sessionResult.token,
    user: toSafeUser(result.user),
    workspace: result.workspace,
    requiresEmailVerification: true,
    emailSent,
  };
};

export const loginUser = async ({ email, password, remember = true }, req) => {
  const context = requestContext(req);
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    await recordFailedLogin({ email, context });
    throw new AppError(errorCodes.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    await recordFailedLogin({ userId: user.id, email, context });
    throw new AppError(errorCodes.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE, 401);
  }

  clearFailedLogin(email, context.ipAddress);

  const sessionResult = await createSession({
    userId: user.id,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    remember,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_LOGGED_IN',
      entityType: 'Session',
      entityId: sessionResult.session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  return {
    token: sessionResult.token,
    user: toSafeUser(user),
  };
};

export const logoutUser = async (req) => {
  if (!req.session?.id || !req.user?.id) return;

  await revokeSession(req.session.id, req.user.id);

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'USER_LOGGED_OUT',
      entityType: 'Session',
      entityId: req.session.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  });
};

export const updatePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);

  const passwordMatches = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(errorCodes.UNAUTHORIZED, 'Incorrect current password.', 401);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'PASSWORD_UPDATED',
      entityType: 'User',
      entityId: userId,
    },
  });
};

export const logoutEverywhere = async (userId) => {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'LOGGED_OUT_EVERYWHERE',
      entityType: 'User',
      entityId: userId,
    },
  });
};
