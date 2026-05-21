import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { hashAuditValue } from '../../utils/crypto.js';

const LOW = 'LOW';
const MEDIUM = 'MEDIUM';
const HIGH = 'HIGH';

const auditThrottleCache = new Map();

const secondsFromMs = (ms) => Math.max(1, Math.ceil(ms / 1000));
const nowDate = () => new Date();
const requestContext = (req) => ({
  ipAddress: req.ip || 'unknown',
  userAgent: req.get('user-agent') || null,
});

const toEmailDomain = (email) => String(email || '').split('@')[1]?.toLowerCase() || '';
const counterKey = (...parts) => parts.filter(Boolean).join(':');
const makeKeyHash = (...parts) => hashAuditValue(counterKey(...parts));

const cleanupExpiredCounters = async ({ tx = prisma } = {}) => {
  if (Math.random() > 0.02) return;
  await tx.authAbuseCounter.deleteMany({
    where: { expiresAt: { lte: nowDate() } },
  }).catch(() => {});
};

const getCounter = async ({ tx = prisma, bucket, action = 'COUNT', key }) => {
  const keyHash = makeKeyHash(key);
  const counter = await tx.authAbuseCounter.findUnique({
    where: {
      bucket_keyHash_action: {
        bucket,
        keyHash,
        action,
      },
    },
  });
  if (!counter) return null;
  if (counter.expiresAt <= nowDate()) return null;
  return counter;
};

const touchCounter = async ({
  tx = prisma,
  bucket,
  action = 'COUNT',
  key,
  windowMs,
  increment = 1,
  metadata = null,
}) => {
  const keyHash = makeKeyHash(key);
  const current = await tx.authAbuseCounter.findUnique({
    where: {
      bucket_keyHash_action: {
        bucket,
        keyHash,
        action,
      },
    },
  });

  const now = nowDate();
  const expiresAt = new Date(now.getTime() + windowMs);

  if (!current) {
    return tx.authAbuseCounter.create({
      data: {
        bucket,
        keyHash,
        action,
        count: increment,
        firstSeenAt: now,
        expiresAt,
        metadata,
      },
    });
  }

  if (current.expiresAt <= now) {
    return tx.authAbuseCounter.update({
      where: { id: current.id },
      data: {
        count: increment,
        firstSeenAt: now,
        expiresAt,
        metadata,
      },
    });
  }

  return tx.authAbuseCounter.update({
    where: { id: current.id },
    data: {
      count: { increment },
      expiresAt,
      metadata: metadata ?? current.metadata ?? undefined,
    },
  });
};

const clearCounters = async ({ tx = prisma, rules = [] }) => {
  if (!rules.length) return;
  await Promise.all(rules.map(({ bucket, action = 'COUNT', key }) => tx.authAbuseCounter.deleteMany({
    where: {
      bucket,
      action,
      keyHash: makeKeyHash(key),
    },
  })));
};

const maybeRecordAbuseEvent = async ({
  tx = prisma,
  action,
  outcome,
  keyHash = null,
  context,
  userId = null,
  metadata = {},
}) => {
  const cacheKey = `${action}:${outcome}:${context?.ipAddress || 'unknown'}:${keyHash || 'none'}`;
  const now = Date.now();
  const last = auditThrottleCache.get(cacheKey) || 0;
  if (now - last < env.AUTH_ABUSE_AUDIT_THROTTLE_MS) return;
  auditThrottleCache.set(cacheKey, now);
  if (auditThrottleCache.size > 5000) auditThrottleCache.clear();

  await tx.authAbuseEvent.create({
    data: {
      userId,
      action,
      outcome,
      keyHash,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      metadata,
    },
  }).catch(() => {});

  await tx.auditLog.create({
    data: {
      userId,
      action,
      entityType: 'AuthAbuse',
      metadata,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    },
  }).catch(() => {});
};

const rateLimitedError = (message, retryAfterSeconds = null) => new AppError(
  errorCodes.RATE_LIMITED,
  message,
  429,
  retryAfterSeconds ? { retryAfterSeconds } : undefined,
);

const botChallengeRequiredError = () => new AppError(
  errorCodes.BOT_CHALLENGE_REQUIRED,
  'We could not verify this request. Please try again.',
  403,
);

const assessSoftRisk = ({ honeypotTriggered = false, formDurationMs = null }) => {
  if (honeypotTriggered) return HIGH;
  if (Number.isFinite(formDurationMs) && formDurationMs >= 0 && formDurationMs < env.AUTH_MIN_FORM_DURATION_MS) {
    return MEDIUM;
  }
  return LOW;
};

const allowResult = (riskLevel = LOW) => ({
  allowed: true,
  challengeRequired: false,
  reason: null,
  retryAfterSeconds: null,
  riskLevel,
});

const challengeResult = (reason, riskLevel = MEDIUM) => ({
  allowed: false,
  challengeRequired: true,
  reason,
  retryAfterSeconds: null,
  riskLevel,
});

const blockedResult = (reason, retryAfterSeconds = null, riskLevel = HIGH) => ({
  allowed: false,
  challengeRequired: false,
  reason,
  retryAfterSeconds,
  riskLevel,
});

export const getAuthRequestContext = requestContext;

export const evaluateSignupAbuse = async ({
  email,
  req,
  honeypotTriggered = false,
  formDurationMs = null,
  isOAuth = false,
}) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();

  const context = requestContext(req);
  const emailHash = makeKeyHash('email', email);
  const domain = toEmailDomain(email);
  const domainHash = makeKeyHash('domain', domain);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const dailyIpHash = makeKeyHash('ip-daily', context.ipAddress);
  const softRisk = assessSoftRisk({ honeypotTriggered, formDurationMs });

  await cleanupExpiredCounters();

  if (env.DISPOSABLE_EMAIL_BLOCKLIST_ENABLED && env.DISPOSABLE_EMAIL_DOMAINS_LIST.includes(domain)) {
    await maybeRecordAbuseEvent({
      action: isOAuth ? 'AUTH_ABUSE_OAUTH_SIGNUP_BLOCKED' : 'AUTH_ABUSE_SIGNUP_BLOCKED',
      outcome: 'DISPOSABLE_DOMAIN',
      keyHash: domainHash,
      context,
      metadata: { domainHash },
    });
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Use a permanent email address.', 400);
  }

  const [ipCounter, dailyIpCounter, domainCounter, emailCounter] = await prisma.$transaction(async (tx) => {
    const ipBucket = isOAuth ? 'oauth-signup-ip' : 'signup-ip';
    const domainBucket = isOAuth ? 'oauth-signup-domain' : 'signup-domain';
    const ipWindowMs = isOAuth ? env.OAUTH_SIGNUP_IP_WINDOW_MS : env.SIGNUP_IP_WINDOW_MS;
    const ipMax = isOAuth ? env.OAUTH_SIGNUP_IP_MAX : env.SIGNUP_IP_MAX;
    const domainWindowMs = isOAuth ? env.OAUTH_SIGNUP_DOMAIN_WINDOW_MS : env.SIGNUP_EMAIL_DOMAIN_WINDOW_MS;

    const ip = await touchCounter({ tx, bucket: ipBucket, key: ipHash, windowMs: ipWindowMs, metadata: { ipHash } });
    const dailyIp = isOAuth
      ? null
      : await touchCounter({ tx, bucket: 'signup-ip-daily', key: dailyIpHash, windowMs: 24 * 60 * 60 * 1000, metadata: { ipHash } });
    const byDomain = await touchCounter({ tx, bucket: domainBucket, key: domainHash, windowMs: domainWindowMs, metadata: { domainHash } });
    const byEmail = await touchCounter({
      tx,
      bucket: isOAuth ? 'oauth-signup-email' : 'signup-email',
      key: emailHash,
      windowMs: env.SIGNUP_EMAIL_HASH_WINDOW_MS,
      metadata: { emailHash },
    });

    if (ip.count > ipMax || (dailyIp && dailyIp.count > env.SIGNUP_IP_DAILY_MAX) || byDomain.count > (isOAuth ? env.OAUTH_SIGNUP_DOMAIN_MAX : env.SIGNUP_EMAIL_DOMAIN_MAX) || byEmail.count > env.SIGNUP_EMAIL_HASH_MAX) {
      await maybeRecordAbuseEvent({
        tx,
        action: isOAuth ? 'AUTH_ABUSE_OAUTH_SIGNUP_BLOCKED' : 'AUTH_ABUSE_SIGNUP_BLOCKED',
        outcome: 'RATE_LIMITED',
        keyHash: emailHash,
        context,
        metadata: {
          emailHash,
          domainHash,
          ipHash,
          ipCount: ip.count,
          domainCount: byDomain.count,
          emailCount: byEmail.count,
          dailyIpCount: dailyIp?.count || null,
        },
      });
    }

    return [ip, dailyIp, byDomain, byEmail];
  });

  const ipWindowMs = isOAuth ? env.OAUTH_SIGNUP_IP_WINDOW_MS : env.SIGNUP_IP_WINDOW_MS;
  const domainMax = isOAuth ? env.OAUTH_SIGNUP_DOMAIN_MAX : env.SIGNUP_EMAIL_DOMAIN_MAX;
  const ipMax = isOAuth ? env.OAUTH_SIGNUP_IP_MAX : env.SIGNUP_IP_MAX;
  if (ipCounter.count > ipMax || (dailyIpCounter && dailyIpCounter.count > env.SIGNUP_IP_DAILY_MAX) || domainCounter.count > domainMax || emailCounter.count > env.SIGNUP_EMAIL_HASH_MAX) {
    throw rateLimitedError('Too many attempts. Please wait a moment and try again.', secondsFromMs(ipWindowMs));
  }

  if (softRisk !== LOW && env.BOT_CHALLENGE_ENABLED && env.BOT_CHALLENGE_SIGNUP_MODE === 'risk_based') {
    return challengeResult('BOT_CHALLENGE_REQUIRED', softRisk);
  }

  if (softRisk === HIGH) {
    await maybeRecordAbuseEvent({
      action: isOAuth ? 'AUTH_ABUSE_OAUTH_SIGNUP_BLOCKED' : 'AUTH_ABUSE_SIGNUP_BLOCKED',
      outcome: 'HONEYPOT',
      keyHash: emailHash,
      context,
      metadata: { emailHash, domainHash, ipHash },
    });
    throw rateLimitedError('Too many attempts. Please wait a moment and try again.', secondsFromMs(ipWindowMs));
  }

  return allowResult(softRisk);
};

export const assertSignupAbuseAllowed = async (args) => {
  const result = await evaluateSignupAbuse(args);
  if (result.challengeRequired) throw botChallengeRequiredError();
  if (!result.allowed) throw rateLimitedError('Too many attempts. Please wait a moment and try again.', result.retryAfterSeconds);
  return result;
};

export const assertOAuthStartAllowed = async ({ provider, req }) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();
  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const counter = await touchCounter({
    bucket: `oauth-start-${provider}`,
    key: ipHash,
    windowMs: env.OAUTH_START_IP_WINDOW_MS,
    metadata: { ipHash, provider },
  });
  if (counter.count > env.OAUTH_START_IP_MAX) {
    await maybeRecordAbuseEvent({
      action: 'AUTH_ABUSE_OAUTH_SIGNUP_BLOCKED',
      outcome: 'OAUTH_START_RATE_LIMITED',
      keyHash: ipHash,
      context,
      metadata: { provider, ipHash, count: counter.count },
    });
    throw rateLimitedError('Too many sign-in attempts. Please wait a moment and try again.', secondsFromMs(env.OAUTH_START_IP_WINDOW_MS));
  }
  return allowResult();
};

export const assertOAuthCallbackAllowed = async ({ provider, req }) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();
  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const counter = await touchCounter({
    bucket: `oauth-callback-${provider}`,
    key: ipHash,
    windowMs: env.OAUTH_CALLBACK_IP_WINDOW_MS,
    metadata: { ipHash, provider },
  });
  if (counter.count > env.OAUTH_CALLBACK_IP_MAX) {
    await maybeRecordAbuseEvent({
      action: 'AUTH_ABUSE_OAUTH_SIGNUP_BLOCKED',
      outcome: 'OAUTH_CALLBACK_RATE_LIMITED',
      keyHash: ipHash,
      context,
      metadata: { provider, ipHash, count: counter.count },
    });
    throw rateLimitedError('Too many sign-in attempts. Please wait a moment and try again.', secondsFromMs(env.OAUTH_CALLBACK_IP_WINDOW_MS));
  }
  return allowResult();
};

export const assertLoginAllowed = async ({ email, req }) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();

  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const emailHash = makeKeyHash('email', email);
  const pairHash = makeKeyHash('ip-email', context.ipAddress, email);

  const legacyEmailHash = hashAuditValue(email);
  const [emailCounter, ipCounter, pairCounter, distinctEmailCounter, distinctIpCounter, legacyCounter] = await Promise.all([
    getCounter({ bucket: 'login-fail-email', key: emailHash }),
    getCounter({ bucket: 'login-fail-ip', key: ipHash }),
    getCounter({ bucket: 'login-fail-ip-email', key: pairHash }),
    getCounter({ bucket: 'login-fail-ip-distinct-email', key: ipHash }),
    getCounter({ bucket: 'login-fail-email-distinct-ip', key: emailHash }),
    prisma.failedLoginAttempt.findUnique({
      where: {
        ipAddress_emailHash: {
          ipAddress: context.ipAddress || 'unknown',
          emailHash: legacyEmailHash,
        },
      },
    }),
  ]);

  const retryAfterMs = Math.max(
    emailCounter ? emailCounter.expiresAt.getTime() - Date.now() : 0,
    ipCounter ? ipCounter.expiresAt.getTime() - Date.now() : 0,
    pairCounter ? pairCounter.expiresAt.getTime() - Date.now() : 0,
    distinctEmailCounter ? distinctEmailCounter.expiresAt.getTime() - Date.now() : 0,
    distinctIpCounter ? distinctIpCounter.expiresAt.getTime() - Date.now() : 0,
    legacyCounter?.expiresAt ? legacyCounter.expiresAt.getTime() - Date.now() : 0,
  );

  if (
    (emailCounter?.count || 0) >= env.LOGIN_EMAIL_MAX_FAILED
    || (ipCounter?.count || 0) >= env.LOGIN_IP_MAX_FAILED
    || (pairCounter?.count || 0) >= env.LOGIN_IP_EMAIL_MAX_FAILED
    || (distinctEmailCounter?.count || 0) >= env.LOGIN_IP_DISTINCT_EMAIL_MAX
    || (distinctIpCounter?.count || 0) >= env.LOGIN_EMAIL_DISTINCT_IP_MAX
    || ((legacyCounter?.attempts || 0) >= env.FAILED_LOGIN_MAX_ATTEMPTS && legacyCounter?.expiresAt > nowDate())
  ) {
    await maybeRecordAbuseEvent({
      action: 'AUTH_ABUSE_LOGIN_BLOCKED',
      outcome: 'RATE_LIMITED',
      keyHash: emailHash,
      context,
      metadata: {
        emailHash,
        ipHash,
        pairHash,
        emailCount: emailCounter?.count || 0,
        ipCount: ipCounter?.count || 0,
        pairCount: pairCounter?.count || 0,
        distinctEmailCount: distinctEmailCounter?.count || 0,
        distinctIpCount: distinctIpCounter?.count || 0,
      },
    });
    throw rateLimitedError('Too many failed login attempts. Please try again later.', secondsFromMs(retryAfterMs || env.LOGIN_EMAIL_WINDOW_MS));
  }

  return allowResult();
};

export const recordLoginFailure = async ({ email, req, userId: _userId = null }) => {
  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const emailHash = makeKeyHash('email', email);
  const pairHash = makeKeyHash('ip-email', context.ipAddress, email);

  const [emailPairMarker, ipPairMarker] = await Promise.all([
    getCounter({ bucket: 'login-email-ip-pair', action: 'PAIR', key: pairHash }),
    getCounter({ bucket: 'login-ip-email-pair', action: 'PAIR', key: pairHash }),
  ]);

  const results = await prisma.$transaction(async (tx) => {
    const emailCounter = await touchCounter({
      tx,
      bucket: 'login-fail-email',
      key: emailHash,
      windowMs: env.LOGIN_EMAIL_WINDOW_MS,
      metadata: { emailHash },
    });
    const ipCounter = await touchCounter({
      tx,
      bucket: 'login-fail-ip',
      key: ipHash,
      windowMs: env.LOGIN_IP_WINDOW_MS,
      metadata: { ipHash },
    });
    const pairCounter = await touchCounter({
      tx,
      bucket: 'login-fail-ip-email',
      key: pairHash,
      windowMs: env.LOGIN_IP_EMAIL_WINDOW_MS,
      metadata: { emailHash, ipHash },
    });

    await tx.failedLoginAttempt.upsert({
      where: {
        ipAddress_emailHash: {
          ipAddress: context.ipAddress || 'unknown',
          emailHash: hashAuditValue(email),
        },
      },
      update: {
        attempts: { increment: 1 },
        expiresAt: new Date(Date.now() + (env.FAILED_LOGIN_ATTEMPT_TTL_MINUTES * 60 * 1000)),
      },
      create: {
        ipAddress: context.ipAddress || 'unknown',
        emailHash: hashAuditValue(email),
        attempts: 1,
        expiresAt: new Date(Date.now() + (env.FAILED_LOGIN_ATTEMPT_TTL_MINUTES * 60 * 1000)),
      },
    });

    if (!ipPairMarker) {
      await touchCounter({
        tx,
        bucket: 'login-ip-email-pair',
        action: 'PAIR',
        key: pairHash,
        windowMs: env.LOGIN_IP_DISTINCT_EMAIL_WINDOW_MS,
        metadata: { emailHash, ipHash },
      });
      await touchCounter({
        tx,
        bucket: 'login-fail-ip-distinct-email',
        key: ipHash,
        windowMs: env.LOGIN_IP_DISTINCT_EMAIL_WINDOW_MS,
        metadata: { ipHash },
      });
    }

    if (!emailPairMarker) {
      await touchCounter({
        tx,
        bucket: 'login-email-ip-pair',
        action: 'PAIR',
        key: pairHash,
        windowMs: env.LOGIN_EMAIL_DISTINCT_IP_WINDOW_MS,
        metadata: { emailHash, ipHash },
      });
      await touchCounter({
        tx,
        bucket: 'login-fail-email-distinct-ip',
        key: emailHash,
        windowMs: env.LOGIN_EMAIL_DISTINCT_IP_WINDOW_MS,
        metadata: { emailHash },
      });
    }

    return { emailCounter, ipCounter, pairCounter };
  });

  const failureCount = Math.max(results.emailCounter.count, results.pairCounter.count);
  return {
    failureCount,
    delayMs: Math.min(150 * failureCount, env.LOGIN_DELAY_MAX_MS),
  };
};

export const clearLoginFailureState = async ({ email, req }) => {
  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const emailHash = makeKeyHash('email', email);
  const pairHash = makeKeyHash('ip-email', context.ipAddress, email);
  await clearCounters({
    rules: [
      { bucket: 'login-fail-email', key: emailHash },
      { bucket: 'login-fail-ip-email', key: pairHash },
      { bucket: 'login-email-ip-pair', action: 'PAIR', key: pairHash },
      { bucket: 'login-ip-email-pair', action: 'PAIR', key: pairHash },
    ],
  });
  await prisma.failedLoginAttempt.deleteMany({
    where: {
      ipAddress: context.ipAddress || 'unknown',
      emailHash: hashAuditValue(email),
    },
  }).catch(() => {});
  return { ipHash, emailHash };
};

export const evaluatePasswordResetAbuse = async ({ email, req, botChallengeRequired = false }) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();

  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const emailHash = makeKeyHash('email', email);
  const pairHash = makeKeyHash('ip-email', context.ipAddress, email);

  const [emailCounter, ipCounter, pairCounter] = await prisma.$transaction(async (tx) => Promise.all([
    touchCounter({ tx, bucket: 'password-reset-email', key: emailHash, windowMs: env.PASSWORD_RESET_EMAIL_WINDOW_MS, metadata: { emailHash } }),
    touchCounter({ tx, bucket: 'password-reset-ip', key: ipHash, windowMs: env.PASSWORD_RESET_IP_WINDOW_MS, metadata: { ipHash } }),
    touchCounter({ tx, bucket: 'password-reset-ip-email', key: pairHash, windowMs: env.PASSWORD_RESET_IP_EMAIL_WINDOW_MS, metadata: { emailHash, ipHash } }),
  ]));

  if (
    emailCounter.count > env.PASSWORD_RESET_EMAIL_MAX
    || ipCounter.count > env.PASSWORD_RESET_IP_MAX
    || pairCounter.count > env.PASSWORD_RESET_IP_EMAIL_MAX
  ) {
    await maybeRecordAbuseEvent({
      action: 'AUTH_ABUSE_PASSWORD_RESET_BLOCKED',
      outcome: 'SUPPRESSED',
      keyHash: emailHash,
      context,
      metadata: {
        emailHash,
        ipHash,
        pairHash,
        emailCount: emailCounter.count,
        ipCount: ipCounter.count,
        pairCount: pairCounter.count,
      },
    });
    return blockedResult('PASSWORD_RESET_SUPPRESSED', secondsFromMs(env.PASSWORD_RESET_EMAIL_WINDOW_MS));
  }

  if (botChallengeRequired && env.BOT_CHALLENGE_ENABLED && env.BOT_CHALLENGE_PASSWORD_RESET_MODE === 'risk_based') {
    return challengeResult('BOT_CHALLENGE_REQUIRED');
  }

  return allowResult();
};

export const assertVerificationResendAllowed = async ({ userId, req }) => {
  if (!env.AUTH_ABUSE_PROTECTION_ENABLED) return allowResult();
  const context = requestContext(req);
  const ipHash = makeKeyHash('ip', context.ipAddress);
  const userHash = makeKeyHash('user', userId);

  const [ipCounter, userCounter] = await prisma.$transaction(async (tx) => Promise.all([
    touchCounter({ tx, bucket: 'verification-resend-ip', key: ipHash, windowMs: env.VERIFICATION_RESEND_IP_WINDOW_MS, metadata: { ipHash } }),
    touchCounter({ tx, bucket: 'verification-resend-user', key: userHash, windowMs: env.VERIFICATION_RESEND_USER_WINDOW_MS, metadata: { userHash, userId } }),
  ]));

  if (ipCounter.count > env.VERIFICATION_RESEND_IP_MAX || userCounter.count > env.VERIFICATION_RESEND_USER_MAX) {
    await maybeRecordAbuseEvent({
      action: 'AUTH_ABUSE_VERIFICATION_RESEND_BLOCKED',
      outcome: 'RATE_LIMITED',
      keyHash: userHash,
      userId,
      context,
      metadata: { userHash, ipHash, ipCount: ipCounter.count, userCount: userCounter.count },
    });
    throw rateLimitedError('Too many attempts. Please wait a moment and try again.', secondsFromMs(env.VERIFICATION_RESEND_USER_WINDOW_MS));
  }

  return allowResult();
};

export const recordBotChallengeOutcome = async ({ req, outcome, userId = null, metadata = {} }) => {
  const context = requestContext(req);
  await maybeRecordAbuseEvent({
    action: outcome === 'PASSED' ? 'BOT_CHALLENGE_PASSED' : 'BOT_CHALLENGE_FAILED',
    outcome,
    userId,
    keyHash: metadata.keyHash || null,
    context,
    metadata,
  });
};
