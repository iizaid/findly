import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { hashAuditValue } from '../../utils/crypto.js';
import { grantInitialCreditsIfEligible } from '../credits/credit.service.js';
import { createUserWithDefaultWorkspace, finalizePrimaryAuthentication } from './auth.service.js';
import {
  assertOAuthProviderConfigured,
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  fetchOAuthIdentity,
  getOAuthProviderConfig,
} from './oauth.providers.js';
import {
  assertOAuthCallbackAllowed,
  assertOAuthStartAllowed,
  assertSignupAbuseAllowed,
  getAuthRequestContext,
} from './authAbuse.service.js';

const STATE_BYTES = 32;
export const OAUTH_STATE_COOKIE_NAME = 'findly_oauth_state';

export const createOAuthStateToken = () => crypto.randomBytes(STATE_BYTES).toString('base64url');

export const hashOAuthState = (state) => crypto
  .createHmac('sha256', env.SESSION_SECRET)
  .update(`oauth-state:${state}`)
  .digest('hex');

const minutesToMs = (minutes) => minutes * 60 * 1000;

export const buildOAuthStateCookieValue = ({ provider, state }) => `${provider}:${state}`;

export const getOAuthStateCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : env.IS_PRODUCTION,
  path: '/api/auth/oauth',
  maxAge: minutesToMs(env.OAUTH_STATE_TTL_MINUTES),
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const clearOAuthStateCookieOptions = () => {
  const options = getOAuthStateCookieOptions();
  delete options.maxAge;
  return options;
};

export const verifyOAuthStateCookie = ({ provider, state, cookieValue }) => {
  if (!provider || !state || cookieValue !== buildOAuthStateCookieValue({ provider, state })) {
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'OAuth sign-in session expired. Please try again.', 400);
  }
};

export const getSafeOAuthReturnTo = (value) => {
  const fallback = env.OAUTH_DEFAULT_SUCCESS_PATH || '/dashboard';
  const allowed = new Set(env.OAUTH_ALLOWED_RETURN_PATHS_LIST?.length
    ? env.OAUTH_ALLOWED_RETURN_PATHS_LIST
    : ['/dashboard']);
  if (!value) return allowed.has(fallback) ? fallback : [...allowed][0] || '/dashboard';

  try {
    const clientOrigin = new URL(env.CLIENT_URL).origin;
    const parsed = new URL(String(value), env.CLIENT_URL);
    if (parsed.origin !== clientOrigin) return fallback;
    if (!allowed.has(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
};

const failureRedirectUrl = (authError = 'oauth_login_failed') => {
  const path = env.OAUTH_FAILURE_PATH || '/auth';
  const url = new URL(path, env.CLIENT_URL);
  url.searchParams.set('authError', authError);
  return url.toString();
};

export const oauthErrorCode = (error) => {
  if (error instanceof AppError) {
    if (error.code === errorCodes.PROVIDER_NOT_CONFIGURED) return 'oauth_provider_unavailable';
    if (error.code === errorCodes.VERIFICATION_TOKEN_INVALID) return 'oauth_invalid_state';
    if (error.code === errorCodes.EMAIL_NOT_VERIFIED) return 'oauth_email_unverified';
    if (error.code === errorCodes.VALIDATION_ERROR && /email address/i.test(error.message)) return 'oauth_email_missing';
  }
  return 'oauth_login_failed';
};

export const getOAuthFailureRedirectUrl = (errorCode) => failureRedirectUrl(errorCode);

const auditOAuth = (tx, {
  userId = null,
  action,
  provider,
  providerAccountId = null,
  email = null,
  metadata = {},
  context,
}) => tx.auditLog.create({
  data: {
    userId,
    action,
    entityType: 'OAuthAccount',
    entityId: provider,
    metadata: {
      provider,
      providerAccountIdHash: providerAccountId ? hashAuditValue(`${provider}:${providerAccountId}`) : null,
      emailHash: email ? hashAuditValue(email) : null,
      ...metadata,
    },
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  },
});

export const createOAuthStart = async ({ provider, returnTo, req }) => {
  const config = assertOAuthProviderConfigured(provider);
  await assertOAuthStartAllowed({ provider: config.provider, req });
  const context = getAuthRequestContext(req);
  const state = createOAuthStateToken();
  const stateHash = hashOAuthState(state);
  const safeReturnTo = getSafeOAuthReturnTo(returnTo);
  const expiresAt = new Date(Date.now() + minutesToMs(env.OAUTH_STATE_TTL_MINUTES));

  await prisma.$transaction(async (tx) => {
    await tx.oAuthState.create({
      data: {
        stateHash,
        provider: config.provider,
        returnTo: safeReturnTo,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    await auditOAuth(tx, {
      action: 'OAUTH_LOGIN_STARTED',
      provider: config.provider,
      metadata: {
        returnTo: safeReturnTo,
        expiresAt,
      },
      context,
    });
  });

  return {
    provider: config.provider,
    stateCookieValue: buildOAuthStateCookieValue({ provider: config.provider, state }),
    authorizationUrl: buildOAuthAuthorizationUrl({ provider: config.provider, state }),
  };
};

export const consumeOAuthState = async ({ provider, state }) => {
  const config = getOAuthProviderConfig(provider);
  if (!state) {
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'OAuth sign-in session expired. Please try again.', 400);
  }
  const stateHash = hashOAuthState(state);
  const stored = await prisma.oAuthState.findUnique({ where: { stateHash } });
  if (!stored || stored.provider !== config.provider || stored.usedAt || stored.expiresAt <= new Date()) {
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'OAuth sign-in session expired. Please try again.', 400);
  }

  const updated = await prisma.oAuthState.updateMany({
    where: {
      id: stored.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      provider: config.provider,
    },
    data: { usedAt: new Date() },
  });

  if (updated.count !== 1) {
    throw new AppError(errorCodes.VERIFICATION_TOKEN_INVALID, 'OAuth sign-in session expired. Please try again.', 400);
  }

  return stored;
};

const assertVerifiedIdentity = (identity) => {
  if (!identity.providerAccountId) {
    throw new AppError(errorCodes.PROVIDER_BAD_RESPONSE, 'OAuth provider did not return a stable account id.', 502);
  }
  if (!identity.email) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'OAuth provider did not return an email address.', 400);
  }
  if (!identity.emailVerified) {
    throw new AppError(errorCodes.EMAIL_NOT_VERIFIED, 'OAuth provider did not return a verified email address.', 403);
  }
};

const displayNameForIdentity = (identity) => {
  const fromProvider = String(identity.displayName || '').trim();
  if (fromProvider.length >= 2) return fromProvider.slice(0, 80);
  return identity.email.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 80) || 'Findly User';
};

const linkIdentityToExistingUser = async ({ tx, user, identity, context }) => {
  const existingUserProvider = await tx.oAuthAccount.findUnique({
    where: {
      userId_provider: {
        userId: user.id,
        provider: identity.provider,
      },
    },
  });
  if (existingUserProvider && existingUserProvider.providerAccountId !== identity.providerAccountId) {
    throw new AppError(errorCodes.CONFLICT, 'This account already has a different identity for this provider.', 409);
  }

  const account = await tx.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    },
  });

  await auditOAuth(tx, {
    userId: user.id,
    action: 'OAUTH_ACCOUNT_LINKED',
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
    email: identity.email,
    metadata: { linkedExistingUser: true },
    context,
  });

  return account;
};

const findPrimaryWorkspaceId = async ({ tx, userId }) => {
  const membership = await tx.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });
  if (membership?.workspaceId) return membership.workspaceId;

  const ownedWorkspace = await tx.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return ownedWorkspace?.id || null;
};

const reconcileVerifiedOAuthUser = async ({ tx, user, context }) => {
  let currentUser = user;
  if (!currentUser.emailVerified) {
    currentUser = await tx.user.update({
      where: { id: currentUser.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: currentUser.emailVerifiedAt || new Date(),
      },
    });
  }

  const workspaceId = await findPrimaryWorkspaceId({ tx, userId: currentUser.id });
  const creditResult = await grantInitialCreditsIfEligible({
    tx,
    userId: currentUser.id,
    workspaceId,
    context,
  });

  const refreshedUser = creditResult.granted
    ? await tx.user.findUnique({ where: { id: currentUser.id } })
    : currentUser;

  return {
    user: refreshedUser,
    workspaceId,
    creditResult,
  };
};

export const findOrCreateOAuthUser = async ({ identity, context }) => {
  assertVerifiedIdentity(identity);

  return prisma.$transaction(async (tx) => {
    const linked = await tx.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (linked) {
      const reconciled = await reconcileVerifiedOAuthUser({ tx, user: linked.user, context });
      const account = await tx.oAuthAccount.update({
        where: { id: linked.id },
        data: {
          email: identity.email,
          emailVerified: identity.emailVerified,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        },
      });
      await auditOAuth(tx, {
        userId: linked.userId,
        action: 'OAUTH_LOGIN_COMPLETED',
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        metadata: {
          linkedExistingUser: true,
          createdNewUser: false,
          emailVerifiedReconciled: !linked.user.emailVerified,
          creditsGranted: Boolean(reconciled.creditResult.granted),
        },
        context,
      });
      return { user: reconciled.user, account, linkedExistingUser: true, createdNewUser: false };
    }

    const existingUser = await tx.user.findUnique({ where: { email: identity.email } });
    if (existingUser) {
      const reconciled = await reconcileVerifiedOAuthUser({ tx, user: existingUser, context });
      const account = await linkIdentityToExistingUser({ tx, user: existingUser, identity, context });
      await auditOAuth(tx, {
        userId: existingUser.id,
        action: 'OAUTH_LOGIN_COMPLETED',
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        metadata: {
          linkedExistingUser: true,
          createdNewUser: false,
          emailVerifiedReconciled: !existingUser.emailVerified,
          creditsGranted: Boolean(reconciled.creditResult.granted),
        },
        context,
      });
      return { user: reconciled.user, account, linkedExistingUser: true, createdNewUser: false };
    }

    await assertSignupAbuseAllowed({
      email: identity.email,
      req: {
        ip: context.ipAddress,
        get: (header) => header?.toLowerCase() === 'user-agent' ? context.userAgent : null,
      },
      honeypotTriggered: false,
      formDurationMs: null,
      isOAuth: true,
    });

    const { user, workspace, creditResult } = await createUserWithDefaultWorkspace({
      tx,
      name: displayNameForIdentity(identity),
      email: identity.email,
      passwordHash: null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      avatarUrl: identity.avatarUrl,
      context,
      auditAction: 'OAUTH_USER_CREATED',
      auditMetadata: {
        provider: identity.provider,
        providerAccountIdHash: hashAuditValue(`${identity.provider}:${identity.providerAccountId}`),
      },
      grantInitialCredits: true,
    });

    const account = await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        emailVerified: identity.emailVerified,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
      },
    });

    await auditOAuth(tx, {
      userId: user.id,
      action: 'OAUTH_LOGIN_COMPLETED',
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      email: identity.email,
      metadata: {
        linkedExistingUser: false,
        createdNewUser: true,
        workspaceId: workspace.id,
        creditsGranted: Boolean(creditResult.granted),
      },
      context,
    });

    return { user, account, workspace, linkedExistingUser: false, createdNewUser: true };
  });
};

export const completeOAuthCallback = async ({ provider, code, state, stateCookieValue, req, fetchImpl = fetch }) => {
  await assertOAuthCallbackAllowed({ provider, req });
  const context = getAuthRequestContext(req);
  verifyOAuthStateCookie({ provider, state, cookieValue: stateCookieValue });
  const storedState = await consumeOAuthState({ provider, state });
  if (!code) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'OAuth provider did not return an authorization code.', 400);
  }

  const token = await exchangeOAuthCode({ provider, code, fetchImpl });
  const identity = await fetchOAuthIdentity({ provider, accessToken: token.accessToken, fetchImpl });
  const result = await findOrCreateOAuthUser({ identity, context });
  const authResult = await finalizePrimaryAuthentication({
    user: result.user,
    remember: true,
    returnTo: storedState.returnTo || env.OAUTH_DEFAULT_SUCCESS_PATH || '/dashboard',
    req,
    challengeType: 'OAUTH_LOGIN',
  });

  return {
    ...authResult,
    linkedExistingUser: result.linkedExistingUser,
    createdNewUser: result.createdNewUser,
  };
};
