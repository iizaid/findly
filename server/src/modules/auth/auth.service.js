import { env } from '../../config/env.js';
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

const pruneFailedLogins = () => {
  const now = Date.now();
  for (const [key, value] of failedLoginAttempts.entries()) {
    if (value.expiresAt < now) {
      failedLoginAttempts.delete(key);
    }
  }
};

const recordFailedLogin = async ({ tx = prisma, userId = null, email, context }) => {
  pruneFailedLogins();
  const key = failedLoginKey(email, context.ipAddress);
  const current = failedLoginAttempts.get(key) || { attempts: 0, expiresAt: 0 };
  const newAttempts = Math.min(current.attempts + 1, 10);
  
  failedLoginAttempts.set(key, {
    attempts: newAttempts,
    expiresAt: Date.now() + (env.FAILED_LOGIN_ATTEMPT_TTL_MINUTES * 60 * 1000),
  });

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

  const delayMs = Math.min(150 * newAttempts, 1500);
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
