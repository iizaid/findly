import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { createSession, revokeSession } from '../sessions/session.service.js';
import { toSafeUser } from '../users/user.mapper.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { hashAuditValue, hashPassword, verifyPassword } from '../../utils/crypto.js';
import { sendVerificationForUser } from './emailVerification.service.js';
import { grantInitialCreditsIfEligible } from '../credits/credit.service.js';
import {
  assertLoginAllowed,
  assertSignupAbuseAllowed,
  clearLoginFailureState,
  getAuthRequestContext,
  recordBotChallengeOutcome,
  recordLoginFailure as recordAuthAbuseLoginFailure,
} from './authAbuse.service.js';
import { enforceBotChallengeIfNeeded } from './botChallenge.service.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUMMY_PASSWORD_HASH = '$2b$10$NLcXp1cWaAG/68QxrfVK0O7GHN3vtnlM8kAOqNtfI/Ki4r2a3Q1bS';
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const registerUser = async ({ name, email, password }, req) => {
  const context = getAuthRequestContext(req);
  const body = req.validated?.body || {};
  const signupEvaluation = await assertSignupAbuseAllowed({
    email,
    req,
    honeypotTriggered: Boolean(body.companyWebsite),
    formDurationMs: body.formDurationMs ?? null,
    isOAuth: false,
  });

  if (env.BOT_CHALLENGE_ENABLED) {
    try {
      await enforceBotChallengeIfNeeded({
        mode: env.BOT_CHALLENGE_SIGNUP_MODE,
        token: body.botChallengeToken,
        req,
        riskLevel: signupEvaluation.riskLevel,
      });
      if (env.BOT_CHALLENGE_SIGNUP_MODE !== 'off') {
        await recordBotChallengeOutcome({
          req,
          outcome: 'PASSED',
          metadata: { keyHash: hashAuditValue(email), route: 'register' },
        });
      }
    } catch (error) {
      await recordBotChallengeOutcome({
        req,
        outcome: 'FAILED',
        metadata: { keyHash: hashAuditValue(email), route: 'register' },
      });
      throw error;
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(errorCodes.CONFLICT, 'An account with this email already exists.', 409);
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    return createUserWithDefaultWorkspace({
      tx,
      name,
      email,
      passwordHash,
      emailVerified: false,
      context,
      auditAction: 'USER_REGISTERED',
      auditMetadata: { initialCreditsGranted: false },
    });
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
  const context = getAuthRequestContext(req);
  await assertLoginAllowed({ email, req });

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    const failure = await recordAuthAbuseLoginFailure({ email, req });
    if (failure.delayMs > 0) await sleep(failure.delayMs);
    throw new AppError(errorCodes.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const passwordMatches = user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!passwordMatches) {
    const failure = await recordAuthAbuseLoginFailure({ userId: user.id, email, req });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'FAILED_LOGIN',
        metadata: { emailHash: hashAuditValue(email), attempts: failure.failureCount },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }).catch(() => {});
    if (failure.delayMs > 0) await sleep(failure.delayMs);
    throw new AppError(errorCodes.UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE, 401);
  }

  await clearLoginFailureState({ email, req });

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

export const updatePassword = async (userId, currentPassword, newPassword, { currentSessionId = null } = {}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);

  if (!user.passwordHash) {
    throw new AppError(errorCodes.UNAUTHORIZED, 'Set a password using account recovery before changing it here.', 401);
  }

  const passwordMatches = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(errorCodes.UNAUTHORIZED, 'Incorrect current password.', 401);
  }

  const passwordHash = await hashPassword(newPassword);

  const revokedSessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    const revoked = await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'PASSWORD_UPDATED',
        entityType: 'User',
        entityId: userId,
        metadata: {
          otherSessionsRevoked: revoked.count,
          keptCurrentSession: Boolean(currentSessionId),
        },
      },
    });

    return revoked.count;
  });

  return { revokedSessions };
};

export const createUserWithDefaultWorkspace = async ({
  tx = prisma,
  name,
  email,
  passwordHash = null,
  emailVerified = false,
  emailVerifiedAt = null,
  avatarUrl = null,
  context = {},
  auditAction = 'USER_REGISTERED',
  auditMetadata = {},
  grantInitialCredits = false,
} = {}) => {
  const user = await tx.user.create({
    data: {
      name,
      email,
      passwordHash,
      avatarUrl,
      creditsBalance: 0,
      emailVerified,
      emailVerifiedAt,
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

  let creditResult = { granted: false };
  if (grantInitialCredits) {
    creditResult = await grantInitialCreditsIfEligible({
      tx,
      userId: user.id,
      workspaceId: workspace.id,
      context,
    });
  }

  await tx.auditLog.create({
    data: {
      userId: user.id,
      action: auditAction,
      entityType: 'User',
      entityId: user.id,
      metadata: {
        emailVerified,
        initialCreditsGranted: Boolean(creditResult.granted),
        workspaceId: workspace.id,
        ...auditMetadata,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  const refreshedUser = creditResult.granted
    ? await tx.user.findUnique({ where: { id: user.id } })
    : user;

  return { user: refreshedUser, workspace, creditResult };
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
