import { prisma } from '../../db/prisma.js';
import { createSession, revokeSession } from '../sessions/session.service.js';
import { toSafeUser } from '../users/user.mapper.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { hashAuditValue, hashPassword, verifyPassword } from '../../utils/crypto.js';
import { sendVerificationForUser } from './emailVerification.service.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUMMY_PASSWORD_HASH = '$2b$10$NLcXp1cWaAG/68QxrfVK0O7GHN3vtnlM8kAOqNtfI/Ki4r2a3Q1bS';
const failedLoginAttempts = new Map();

const requestContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || null,
});

const failedLoginKey = (email, ipAddress) => `${ipAddress || 'unknown'}:${email}`;

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const recordFailedLogin = async ({ tx = prisma, userId = null, email, context }) => {
  const key = failedLoginKey(email, context.ipAddress);
  const currentAttempts = failedLoginAttempts.get(key) || 0;
  failedLoginAttempts.set(key, Math.min(currentAttempts + 1, 10));

  await tx.auditLog.create({
    data: {
      userId,
      action: 'FAILED_LOGIN',
      metadata: {
        emailHash: hashAuditValue(email),
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  const delayMs = Math.min(150 * currentAttempts, 1500);
  if (delayMs > 0) await sleep(delayMs);
};

const clearFailedLogin = (email, ipAddress) => {
  failedLoginAttempts.delete(failedLoginKey(email, ipAddress));
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

    await sendVerificationForUser({
      user,
      req,
      tx,
      resend: false,
    });

    return { user, workspace };
  });

  const sessionResult = await createSession({
    userId: result.user.id,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return {
    token: sessionResult.token,
    user: toSafeUser(result.user),
    workspace: result.workspace,
    requiresEmailVerification: true,
  };
};

export const loginUser = async ({ email, password }, req) => {
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
