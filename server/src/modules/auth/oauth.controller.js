import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getCookieOptions } from '../sessions/session.service.js';
import {
  completeOAuthCallback,
  createOAuthStart,
  getOAuthFailureRedirectUrl,
  oauthErrorCode,
} from './oauth.service.js';

const successRedirectUrl = (returnTo) => new URL(returnTo || env.OAUTH_DEFAULT_SUCCESS_PATH || '/dashboard', env.CLIENT_URL).toString();

const recordOAuthFailure = async ({ req, provider, errorCode }) => {
  await prisma.auditLog.create({
    data: {
      action: 'OAUTH_LOGIN_FAILED',
      entityType: 'OAuthAccount',
      entityId: provider,
      metadata: {
        provider,
        errorCode,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  }).catch(() => {});
};

export const startOAuth = asyncHandler(async (req, res) => {
  const { provider } = req.validated.params;
  const { authorizationUrl } = await createOAuthStart({
    provider,
    returnTo: req.validated.query?.returnTo,
    req,
  });
  return res.redirect(302, authorizationUrl);
});

export const handleOAuthCallback = async (req, res) => {
  const provider = req.validated?.params?.provider || req.params.provider;
  try {
    if (req.validated?.query?.error) {
      throw new Error('OAuth provider returned an error.');
    }

    const result = await completeOAuthCallback({
      provider,
      code: req.validated?.query?.code,
      state: req.validated?.query?.state,
      req,
    });

    res.cookie(env.COOKIE_NAME, result.token, getCookieOptions(true));
    return res.redirect(302, successRedirectUrl(result.returnTo));
  } catch (error) {
    const code = oauthErrorCode(error);
    await recordOAuthFailure({ req, provider, errorCode: code });
    return res.redirect(302, getOAuthFailureRedirectUrl(code));
  }
};
