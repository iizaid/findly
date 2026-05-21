import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import {
  createPasswordResetToken,
  hashAuditValue,
  hashPassword,
  hashPasswordResetToken,
} from '../../utils/crypto.js';
import { sendPasswordResetEmail } from '../mail/mail.service.js';
import {
  evaluatePasswordResetAbuse,
  getAuthRequestContext,
  recordBotChallengeOutcome,
} from './authAbuse.service.js';
import { enforceBotChallengeIfNeeded } from './botChallenge.service.js';

export const PASSWORD_RESET_GENERIC_MESSAGE = 'If an account exists, a reset email has been sent.';

const minutesToMs = (minutes) => minutes * 60 * 1000;

const resetUrl = (rawToken) => {
  const url = new URL('/reset-password', env.CLIENT_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
};

export const requestPasswordReset = async ({ email, botChallengeToken }, req) => {
  const context = getAuthRequestContext(req);
  const emailHash = hashAuditValue(email);
  const abuseEvaluation = await evaluatePasswordResetAbuse({
    email,
    req,
    botChallengeRequired: true,
  });

  if (env.BOT_CHALLENGE_ENABLED) {
    try {
      await enforceBotChallengeIfNeeded({
        mode: env.BOT_CHALLENGE_PASSWORD_RESET_MODE,
        token: botChallengeToken,
        req,
        riskLevel: abuseEvaluation.riskLevel,
      });
      if (env.BOT_CHALLENGE_PASSWORD_RESET_MODE !== 'off') {
        await recordBotChallengeOutcome({
          req,
          outcome: 'PASSED',
          metadata: { keyHash: emailHash, route: 'forgot-password' },
        });
      }
    } catch (error) {
      await recordBotChallengeOutcome({
        req,
        outcome: 'FAILED',
        metadata: { keyHash: emailHash, route: 'forgot-password' },
      });
      throw error;
    }
  }

  if (!abuseEvaluation.allowed) {
    return { sent: false, suppressed: true };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
    },
  });

  if (!user || !user.emailVerified) {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user?.id || null,
        metadata: {
          emailHash,
          sent: false,
          reason: !user ? 'no_matching_verified_user' : 'email_not_verified',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }).catch(() => {});

    return { sent: false };
  }

  const rawToken = createPasswordResetToken();
  const tokenHash = hashPasswordResetToken(rawToken);
  const expiresAt = new Date(Date.now() + minutesToMs(env.PASSWORD_RESET_TTL_MINUTES));

  const token = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const created = await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'PasswordResetToken',
        entityId: created.id,
        metadata: {
          tokenId: created.id,
          expiresAt,
          sent: true,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return created;
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: resetUrl(rawToken),
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    });
  } catch {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_EMAIL_SEND_FAILED',
        entityType: 'PasswordResetToken',
        entityId: token.id,
        metadata: {
          tokenId: token.id,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }).catch(() => {});
  }

  return { sent: true };
};

export const resetPasswordWithToken = async ({ token, newPassword }, req) => {
  const context = getAuthRequestContext(req);
  const tokenHash = hashPasswordResetToken(token);
  const storedToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken || storedToken.usedAt || storedToken.expiresAt <= new Date()) {
    await prisma.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_FAILED',
        entityType: 'PasswordResetToken',
        metadata: {
          reason: !storedToken ? 'invalid_token' : storedToken.usedAt ? 'used_token' : 'expired_token',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    }).catch(() => {});

    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'Password reset link is invalid or expired.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const freshToken = await tx.passwordResetToken.findUnique({
      where: { id: storedToken.id },
      include: { user: true },
    });

    if (!freshToken || freshToken.usedAt || freshToken.expiresAt <= new Date()) {
      throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'Password reset link is invalid or expired.', 400);
    }

    await tx.user.update({
      where: { id: freshToken.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: freshToken.id },
      data: { usedAt: new Date() },
    });

    const revoked = await tx.session.updateMany({
      where: {
        userId: freshToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: freshToken.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: freshToken.userId,
        metadata: {
          tokenId: freshToken.id,
          sessionsRevoked: revoked.count,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return { sessionsRevoked: revoked.count };
  });
};
