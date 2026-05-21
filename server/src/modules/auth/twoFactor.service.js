import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import {
  createTwoFactorChallengeToken,
  hashPassword,
  hashTwoFactorChallengeToken,
  verifyPassword,
} from '../../utils/crypto.js';
import { createSession } from '../sessions/session.service.js';
import { toSafeUser } from '../users/user.mapper.js';
import {
  sendPasswordChangedEmail,
  sendTwoFactorBackupCodeUsedEmail,
  sendTwoFactorBackupCodesRegeneratedEmail,
  sendTwoFactorDisabledEmail,
  sendTwoFactorEnabledEmail,
} from '../mail/mail.service.js';

const ENCRYPTION_VERSION = 'v1';
const MASTER_KEY_BYTES = 32;
const BACKUP_CODE_COUNT = 10;
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

authenticator.options = {
  digits: TOTP_DIGITS,
  step: TOTP_PERIOD_SECONDS,
  window: [1, 1],
};

const normalizeTwoFactorCode = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, '')
  .toUpperCase();

const normalizeBackupCode = (value) => normalizeTwoFactorCode(value).replace(/-/g, '');

const parseBackupCodeHashes = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string' && item.length > 0)
  : [];

const decodeMasterKey = (value) => {
  if (!value) return null;

  for (const encoding of ['base64', 'hex']) {
    try {
      const decoded = Buffer.from(value, encoding);
      if (decoded.length === MASTER_KEY_BYTES) return decoded;
    } catch {
      // Try next encoding.
    }
  }

  return null;
};

const getMasterKey = () => decodeMasterKey(env.TWO_FACTOR_SECRET_ENCRYPTION_KEY);

export const isTwoFactorConfigured = () =>
  Boolean(env.TWO_FACTOR_AUTH_ENABLED && getMasterKey());

const assertTwoFactorConfigured = () => {
  if (!env.TWO_FACTOR_AUTH_ENABLED) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'Two-factor authentication is disabled on this server.',
      503,
    );
  }

  if (!getMasterKey()) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'Two-factor authentication is not configured on this server.',
      503,
    );
  }
};

const encryptSecretValue = (plaintext) => {
  assertTwoFactorConfigured();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

const decryptSecretValue = (encrypted) => {
  assertTwoFactorConfigured();
  const [version, iv, tag, ciphertext] = String(encrypted || '').split(':');
  if (version !== ENCRYPTION_VERSION || !iv || !tag || !ciphertext) {
    throw new AppError(errorCodes.CONFIGURATION_ERROR, 'Two-factor secret format is invalid.', 500);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const verifyTotpCode = async ({ secret, code }) => {
  const token = normalizeTwoFactorCode(code);
  return authenticator.check(token, secret);
};

const createBackupCode = () => {
  let raw = '';
  for (let index = 0; index < 8; index += 1) {
    const nextIndex = crypto.randomInt(0, BACKUP_CODE_ALPHABET.length);
    raw += BACKUP_CODE_ALPHABET[nextIndex];
  }

  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const createBackupCodes = async () => {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => createBackupCode());
  const hashes = [];

  for (const code of codes) {
    hashes.push(await hashPassword(normalizeBackupCode(code)));
  }

  return { codes, hashes };
};

const consumeBackupCodeIfValid = async ({ code, hashes }) => {
  const normalized = normalizeBackupCode(code);
  let matchedIndex = -1;

  for (let index = 0; index < hashes.length; index += 1) {
    const isMatch = await verifyPassword(normalized, hashes[index]);
    if (isMatch && matchedIndex === -1) {
      matchedIndex = index;
    }
  }

  if (matchedIndex === -1) {
    return { valid: false, remainingHashes: hashes };
  }

  return {
    valid: true,
    remainingHashes: hashes.filter((_, index) => index !== matchedIndex),
  };
};

const safeAudit = (payload) => prisma.auditLog.create({ data: payload }).catch(() => {});

const getSecurityEmailContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') || null,
});

const sendSecurityEmailSafely = async (fn, args, auditPayload) => {
  try {
    await fn(args);
  } catch {
    await safeAudit(auditPayload);
  }
};

const requireTwoFactorSetting = async (userId) => {
  const setting = await prisma.userTwoFactorSetting.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!setting) {
    throw new AppError(errorCodes.TWO_FACTOR_SETUP_REQUIRED, 'Two-factor authentication setup was not started.', 400);
  }

  return setting;
};

const markChallengeConsumed = async (challengeId) => prisma.twoFactorChallenge.update({
  where: { id: challengeId },
  data: { consumedAt: new Date() },
});

export const getTwoFactorStatus = async (userId) => {
  const setting = await prisma.userTwoFactorSetting.findUnique({
    where: { userId },
    select: {
      enabled: true,
      confirmedAt: true,
      backupCodesHash: true,
    },
  });

  const remaining = parseBackupCodeHashes(setting?.backupCodesHash).length;

  return {
    enabled: Boolean(setting?.enabled),
    confirmedAt: setting?.confirmedAt || null,
    backupCodeCountRemaining: remaining,
  };
};

export const startTwoFactorSetup = async ({ userId, req }) => {
  assertTwoFactorConfigured();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, twoFactorEnabled: true },
  });

  if (!user) {
    throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
  }

  if (user.twoFactorEnabled) {
    throw new AppError(errorCodes.TWO_FACTOR_ALREADY_ENABLED, 'Two-factor authentication is already enabled.', 409);
  }

  const manualSetupKey = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, env.TWO_FACTOR_ISSUER, manualSetupKey);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  });

  await prisma.userTwoFactorSetting.upsert({
    where: { userId },
    update: {
      pendingSecretEncrypted: encryptSecretValue(manualSetupKey),
      pendingSecretMeta: { version: ENCRYPTION_VERSION, issuer: env.TWO_FACTOR_ISSUER },
    },
    create: {
      userId,
      enabled: false,
      pendingSecretEncrypted: encryptSecretValue(manualSetupKey),
      pendingSecretMeta: { version: ENCRYPTION_VERSION, issuer: env.TWO_FACTOR_ISSUER },
    },
  });

  await safeAudit({
    userId,
    action: 'TWO_FACTOR_SETUP_STARTED',
    entityType: 'UserTwoFactorSetting',
    entityId: userId,
    metadata: { issuer: env.TWO_FACTOR_ISSUER },
    ...getSecurityEmailContext(req),
  });

  return {
    otpauthUrl,
    qrCodeDataUrl,
    manualSetupKey,
  };
};

export const confirmTwoFactorSetup = async ({ userId, code, req }) => {
  assertTwoFactorConfigured();
  const setting = await requireTwoFactorSetting(userId);

  if (setting.enabled || setting.user.twoFactorEnabled) {
    throw new AppError(errorCodes.TWO_FACTOR_ALREADY_ENABLED, 'Two-factor authentication is already enabled.', 409);
  }

  if (!setting.pendingSecretEncrypted) {
    throw new AppError(errorCodes.TWO_FACTOR_SETUP_REQUIRED, 'Start two-factor setup before confirming it.', 400);
  }

  const secret = decryptSecretValue(setting.pendingSecretEncrypted);
  const valid = await verifyTotpCode({ secret, code });

  if (!valid) {
    throw new AppError(errorCodes.TWO_FACTOR_CODE_INVALID, 'Invalid authentication code.', 401);
  }

  const backup = await createBackupCodes();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.userTwoFactorSetting.update({
      where: { userId },
      data: {
        enabled: true,
        secretEncrypted: setting.pendingSecretEncrypted,
        secretEncryptionMeta: setting.pendingSecretMeta,
        pendingSecretEncrypted: null,
        pendingSecretMeta: null,
        confirmedAt: now,
        lastUsedAt: now,
        backupCodesHash: backup.hashes,
        backupCodesGeneratedAt: now,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TWO_FACTOR_ENABLED',
        entityType: 'UserTwoFactorSetting',
        entityId: setting.id,
        metadata: {
          backupCodeCount: backup.codes.length,
        },
        ...getSecurityEmailContext(req),
      },
    });
  });

  await sendSecurityEmailSafely(
    sendTwoFactorEnabledEmail,
    {
      to: setting.user.email,
      name: setting.user.name,
    },
    {
      userId,
      action: 'TWO_FACTOR_ENABLED_EMAIL_FAILED',
      entityType: 'UserTwoFactorSetting',
      entityId: setting.id,
      ...getSecurityEmailContext(req),
    },
  );

  return {
    backupCodes: backup.codes,
    enabledAt: now,
  };
};

export const disableTwoFactor = async ({ userId, password, code, req }) => {
  assertTwoFactorConfigured();
  const setting = await requireTwoFactorSetting(userId);

  if (!setting.enabled || !setting.secretEncrypted || !setting.user.twoFactorEnabled) {
    throw new AppError(errorCodes.TWO_FACTOR_NOT_ENABLED, 'Two-factor authentication is not enabled.', 400);
  }

  if (setting.user.passwordHash) {
    if (!password) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Current password is required.', 400);
    }
    const passwordMatches = await verifyPassword(password, setting.user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(errorCodes.UNAUTHORIZED, 'Incorrect current password.', 401);
    }
  }

  const secret = decryptSecretValue(setting.secretEncrypted);
  const backupCodeHashes = parseBackupCodeHashes(setting.backupCodesHash);
  const totpValid = await verifyTotpCode({ secret, code });
  let backupConsumption = { valid: false, remainingHashes: backupCodeHashes };

  if (!totpValid) {
    backupConsumption = await consumeBackupCodeIfValid({ code, hashes: backupCodeHashes });
  }

  if (!totpValid && !backupConsumption.valid) {
    throw new AppError(errorCodes.TWO_FACTOR_CODE_INVALID, 'Invalid authentication code.', 401);
  }

  await prisma.$transaction(async (tx) => {
    await tx.userTwoFactorSetting.update({
      where: { userId },
      data: {
        enabled: false,
        secretEncrypted: null,
        secretEncryptionMeta: null,
        pendingSecretEncrypted: null,
        pendingSecretMeta: null,
        confirmedAt: null,
        lastUsedAt: null,
        backupCodesHash: null,
        backupCodesGeneratedAt: null,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TWO_FACTOR_DISABLED',
        entityType: 'UserTwoFactorSetting',
        entityId: setting.id,
        metadata: {
          disabledWithBackupCode: backupConsumption.valid,
        },
        ...getSecurityEmailContext(req),
      },
    });
  });

  await sendSecurityEmailSafely(
    sendTwoFactorDisabledEmail,
    {
      to: setting.user.email,
      name: setting.user.name,
    },
    {
      userId,
      action: 'TWO_FACTOR_DISABLED_EMAIL_FAILED',
      entityType: 'UserTwoFactorSetting',
      entityId: setting.id,
      ...getSecurityEmailContext(req),
    },
  );
};

export const regenerateTwoFactorBackupCodes = async ({ userId, code, req }) => {
  assertTwoFactorConfigured();
  const setting = await requireTwoFactorSetting(userId);

  if (!setting.enabled || !setting.secretEncrypted) {
    throw new AppError(errorCodes.TWO_FACTOR_NOT_ENABLED, 'Two-factor authentication is not enabled.', 400);
  }

  const secret = decryptSecretValue(setting.secretEncrypted);
  const valid = await verifyTotpCode({ secret, code });
  if (!valid) {
    throw new AppError(errorCodes.TWO_FACTOR_CODE_INVALID, 'Invalid authentication code.', 401);
  }

  const backup = await createBackupCodes();
  const now = new Date();

  await prisma.userTwoFactorSetting.update({
    where: { userId },
    data: {
      backupCodesHash: backup.hashes,
      backupCodesGeneratedAt: now,
      lastUsedAt: now,
    },
  });

  await safeAudit({
    userId,
    action: 'TWO_FACTOR_BACKUP_CODES_REGENERATED',
    entityType: 'UserTwoFactorSetting',
    entityId: setting.id,
    metadata: { backupCodeCount: backup.codes.length },
    ...getSecurityEmailContext(req),
  });

  await sendSecurityEmailSafely(
    sendTwoFactorBackupCodesRegeneratedEmail,
    {
      to: setting.user.email,
      name: setting.user.name,
    },
    {
      userId,
      action: 'TWO_FACTOR_BACKUP_CODES_REGENERATED_EMAIL_FAILED',
      entityType: 'UserTwoFactorSetting',
      entityId: setting.id,
      ...getSecurityEmailContext(req),
    },
  );

  return {
    backupCodes: backup.codes,
  };
};

export const createTwoFactorLoginChallenge = async ({
  userId,
  remember = true,
  returnTo = null,
  req,
  type = 'LOGIN',
}) => {
  assertTwoFactorConfigured();

  await prisma.twoFactorChallenge.updateMany({
    where: {
      userId,
      type,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  const rawToken = createTwoFactorChallengeToken();
  const expiresAt = new Date(Date.now() + env.TWO_FACTOR_LOGIN_CHALLENGE_TTL_MINUTES * 60 * 1000);

  const challenge = await prisma.twoFactorChallenge.create({
    data: {
      userId,
      tokenHash: hashTwoFactorChallengeToken(rawToken),
      type,
      remember,
      returnTo,
      expiresAt,
      ...getSecurityEmailContext(req),
    },
  });

  await safeAudit({
    userId,
    action: 'TWO_FACTOR_LOGIN_CHALLENGE_CREATED',
    entityType: 'TwoFactorChallenge',
    entityId: challenge.id,
    metadata: {
      type,
      expiresAt,
      remember,
      returnTo,
    },
    ...getSecurityEmailContext(req),
  });

  return {
    challengeToken: rawToken,
    expiresAt,
  };
};

export const completeTwoFactorLogin = async ({ challengeToken, code, req }) => {
  assertTwoFactorConfigured();
  const tokenHash = hashTwoFactorChallengeToken(challengeToken);
  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw new AppError(
      errorCodes.TWO_FACTOR_CHALLENGE_INVALID,
      'Invalid or expired two-factor challenge.',
      401,
    );
  }

  if (challenge.failedAttempts >= env.TWO_FACTOR_LOGIN_MAX_ATTEMPTS) {
    await markChallengeConsumed(challenge.id).catch(() => {});
    throw new AppError(
      errorCodes.RATE_LIMITED,
      'Too many attempts, please login again.',
      429,
    );
  }

  const setting = await prisma.userTwoFactorSetting.findUnique({
    where: { userId: challenge.userId },
  });

  if (!setting?.enabled || !setting.secretEncrypted || !challenge.user.twoFactorEnabled) {
    await markChallengeConsumed(challenge.id).catch(() => {});
    throw new AppError(errorCodes.TWO_FACTOR_NOT_ENABLED, 'Two-factor authentication is not enabled.', 400);
  }

  const secret = decryptSecretValue(setting.secretEncrypted);
  const backupCodeHashes = parseBackupCodeHashes(setting.backupCodesHash);
  const totpValid = await verifyTotpCode({ secret, code });
  let backupConsumption = { valid: false, remainingHashes: backupCodeHashes };

  if (!totpValid) {
    backupConsumption = await consumeBackupCodeIfValid({ code, hashes: backupCodeHashes });
  }

  if (!totpValid && !backupConsumption.valid) {
    const failedAttempts = challenge.failedAttempts + 1;
    await prisma.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: {
        failedAttempts,
        consumedAt: failedAttempts >= env.TWO_FACTOR_LOGIN_MAX_ATTEMPTS ? new Date() : null,
      },
    });

    throw new AppError(
      failedAttempts >= env.TWO_FACTOR_LOGIN_MAX_ATTEMPTS ? errorCodes.RATE_LIMITED : errorCodes.TWO_FACTOR_CODE_INVALID,
      failedAttempts >= env.TWO_FACTOR_LOGIN_MAX_ATTEMPTS
        ? 'Too many attempts, please login again.'
        : 'Invalid authentication code.',
      failedAttempts >= env.TWO_FACTOR_LOGIN_MAX_ATTEMPTS ? 429 : 401,
    );
  }

  const sessionResult = await prisma.$transaction(async (tx) => {
    if (backupConsumption.valid) {
      await tx.userTwoFactorSetting.update({
        where: { userId: challenge.userId },
        data: {
          backupCodesHash: backupConsumption.remainingHashes,
          lastUsedAt: new Date(),
        },
      });
    } else {
      await tx.userTwoFactorSetting.update({
        where: { userId: challenge.userId },
        data: {
          lastUsedAt: new Date(),
        },
      });
    }

    await tx.twoFactorChallenge.update({
      where: { id: challenge.id },
      data: {
        consumedAt: new Date(),
      },
    });

    return createSession({
      tx,
      userId: challenge.userId,
      remember: challenge.remember,
      userAgent: req.get('user-agent') || challenge.userAgent,
      ipAddress: req.ip || challenge.ipAddress,
    });
  });

  await safeAudit({
    userId: challenge.userId,
    action: 'TWO_FACTOR_LOGIN_VERIFIED',
    entityType: 'TwoFactorChallenge',
    entityId: challenge.id,
    metadata: {
      usedBackupCode: backupConsumption.valid,
    },
    ...getSecurityEmailContext(req),
  });

  await safeAudit({
    userId: challenge.userId,
    action: 'USER_LOGGED_IN',
    entityType: 'Session',
    entityId: sessionResult.session.id,
    metadata: {
      authFlow: challenge.type,
      usedTwoFactor: true,
      usedBackupCode: backupConsumption.valid,
    },
    ...getSecurityEmailContext(req),
  });

  if (backupConsumption.valid) {
    await sendSecurityEmailSafely(
      sendTwoFactorBackupCodeUsedEmail,
      {
        to: challenge.user.email,
        name: challenge.user.name,
      },
      {
        userId: challenge.userId,
        action: 'TWO_FACTOR_BACKUP_CODE_USED_EMAIL_FAILED',
        entityType: 'TwoFactorChallenge',
        entityId: challenge.id,
        ...getSecurityEmailContext(req),
      },
    );
  }

  return {
    token: sessionResult.token,
    user: toSafeUser(challenge.user),
    returnTo: challenge.returnTo,
    remember: challenge.remember,
  };
};

export const cancelTwoFactorLoginChallenge = async ({ challengeToken, req }) => {
  const tokenHash = hashTwoFactorChallengeToken(challengeToken);
  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { tokenHash },
  });

  if (!challenge || challenge.consumedAt) {
    return;
  }

  await markChallengeConsumed(challenge.id);

  await safeAudit({
    userId: challenge.userId,
    action: 'TWO_FACTOR_LOGIN_CHALLENGE_CANCELLED',
    entityType: 'TwoFactorChallenge',
    entityId: challenge.id,
    ...getSecurityEmailContext(req),
  });
};

export const sendPasswordChangedSecurityEmail = async ({ user, req }) => {
  await sendSecurityEmailSafely(
    sendPasswordChangedEmail,
    {
      to: user.email,
      name: user.name,
    },
    {
      userId: user.id,
      action: 'PASSWORD_CHANGED_EMAIL_FAILED',
      entityType: 'User',
      entityId: user.id,
      ...getSecurityEmailContext(req),
    },
  );
};
