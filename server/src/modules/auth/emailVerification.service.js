import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { createEmailVerificationToken, hashEmailVerificationToken } from '../../utils/crypto.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import { grantInitialCreditsIfEligible } from '../credits/credit.service.js';
import { sendVerificationEmail } from '../mail/mail.service.js';
import { toSafeUser } from '../users/user.mapper.js';
import { assertVerificationResendAllowed, getAuthRequestContext } from './authAbuse.service.js';

const minutesToMs = (minutes) => minutes * 60 * 1000;
const secondsToMs = (seconds) => seconds * 1000;

const verificationUrl = (rawToken) => {
  const url = new URL('/verify-email', env.CLIENT_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
};

export const createVerificationToken = async ({ tx = prisma, userId, context }) => {
  await tx.emailVerificationToken.updateMany({
    where: {
      userId,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  const rawToken = createEmailVerificationToken();
  const tokenHash = hashEmailVerificationToken(rawToken);
  const expiresAt = new Date(Date.now() + minutesToMs(env.EMAIL_VERIFICATION_TTL_MINUTES));

  const token = await tx.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    },
  });

  return {
    rawToken,
    token,
    expiresAt,
    url: verificationUrl(rawToken),
  };
};

export const sendVerificationForUser = async ({ user, req, tx = prisma, resend = false }) => {
  const context = getAuthRequestContext(req);

  const tokenResult = await createVerificationToken({
    tx,
    userId: user.id,
    context,
  });

  await sendVerificationEmail({
    to: user.email,
    name: user.name,
    verificationUrl: tokenResult.url,
    expiresInMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES,
  });

  await tx.user.update({
    where: { id: user.id },
    data: {
      lastVerificationEmailSentAt: new Date(),
    },
  });

  await tx.auditLog.create({
    data: {
      userId: user.id,
      action: resend ? 'EMAIL_VERIFICATION_RESENT' : 'EMAIL_VERIFICATION_SENT',
      entityType: 'EmailVerificationToken',
      entityId: tokenResult.token.id,
      metadata: {
        expiresAt: tokenResult.expiresAt,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  return tokenResult;
};

export const resendVerificationEmail = async (req) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user) {
    throw new AppError(errorCodes.UNAUTHORIZED, 'Authentication required.', 401);
  }

  if (user.emailVerified) {
    return {
      alreadyVerified: true,
      user: toSafeUser(user),
    };
  }

  if (user.lastVerificationEmailSentAt) {
    const elapsed = Date.now() - user.lastVerificationEmailSentAt.getTime();
    const cooldown = secondsToMs(env.VERIFICATION_RESEND_COOLDOWN_SECONDS);
    if (elapsed < cooldown) {
      const retryAfterSeconds = Math.ceil((cooldown - elapsed) / 1000);
      throw new AppError(
        errorCodes.VERIFICATION_RESEND_RATE_LIMITED,
        `Please wait ${retryAfterSeconds} seconds before requesting another verification email.`,
        429,
      );
    }
  }

  await assertVerificationResendAllowed({ userId: user.id, req });

  await sendVerificationForUser({
    user,
    req,
    resend: true,
  });

  return {
    alreadyVerified: false,
    user: toSafeUser({
      ...user,
      lastVerificationEmailSentAt: new Date(),
    }),
  };
};

const findDefaultWorkspaceOrCreate = async ({ tx, user }) => {
  const existing = await tx.workspace.findFirst({
    where: {
      members: {
        some: { userId: user.id },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existing) return existing;

  const workspace = await tx.workspace.create({
    data: {
      ownerId: user.id,
      name: `${user.name}'s workspace`,
    },
  });

  await tx.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  return workspace;
};

export const verifyEmailToken = async ({ token }, req) => {
  const context = getAuthRequestContext(req);
  const tokenHash = hashEmailVerificationToken(token);
  const storedToken = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken) {
    await prisma.auditLog.create({
      data: {
        action: 'EMAIL_VERIFICATION_FAILED',
        entityType: 'EmailVerificationToken',
        metadata: {
          reason: 'not_found',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'Verification link is invalid.', 400);
  }

  if (storedToken.usedAt && storedToken.user.emailVerified) {
    const workspace = await getDefaultWorkspace(storedToken.user.id);
    return {
      alreadyVerified: true,
      user: toSafeUser(storedToken.user),
      workspace,
      creditsGranted: false,
      freshVerification: false,
    };
  }

  if (storedToken.usedAt) {
    await prisma.auditLog.create({
      data: {
        userId: storedToken.userId,
        action: 'EMAIL_VERIFICATION_FAILED',
        entityType: 'EmailVerificationToken',
        entityId: storedToken.id,
        metadata: {
          reason: 'used_token',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'Verification link has already been used.', 400);
  }

  if (storedToken.expiresAt <= new Date()) {
    await prisma.auditLog.create({
      data: {
        userId: storedToken.userId,
        action: 'EMAIL_VERIFICATION_FAILED',
        entityType: 'EmailVerificationToken',
        entityId: storedToken.id,
        metadata: {
          reason: 'expired',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    throw new AppError(errorCodes.VERIFICATION_TOKEN_EXPIRED, 'Verification link has expired.', 410);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: storedToken.id },
      data: { usedAt: new Date() },
    });

    const user = storedToken.user.emailVerified
      ? storedToken.user
      : await tx.user.update({
          where: { id: storedToken.userId },
          data: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
        });

    const workspace = await findDefaultWorkspaceOrCreate({ tx, user });
    const creditResult = await grantInitialCreditsIfEligible({
      tx,
      userId: user.id,
      workspaceId: workspace.id,
      context,
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'EMAIL_VERIFIED',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          tokenId: storedToken.id,
          creditsGranted: Boolean(creditResult.granted),
          workspaceId: workspace.id,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    const refreshedUser = await tx.user.findUnique({
      where: { id: user.id },
    });

    return {
      user: refreshedUser,
      workspace,
      creditsGranted: Boolean(creditResult.granted),
    };
  });

  return {
    alreadyVerified: false,
    user: toSafeUser(result.user),
    workspace: result.workspace,
    creditsGranted: result.creditsGranted,
    freshVerification: true,
  };
};
