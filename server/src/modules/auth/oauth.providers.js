import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

const OAUTH_PROVIDER_FETCH_TIMEOUT_MS = 5000;

export const OAUTH_PROVIDERS = Object.freeze({
  google: {
    provider: 'google',
    label: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    envPrefix: 'GOOGLE_OAUTH',
  },
  github: {
    provider: 'github',
    label: 'GitHub',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userinfoEndpoint: 'https://api.github.com/user',
    emailEndpoint: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
    envPrefix: 'GITHUB_OAUTH',
  },
  discord: {
    provider: 'discord',
    label: 'Discord',
    authorizationEndpoint: 'https://discord.com/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userinfoEndpoint: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    envPrefix: 'DISCORD_OAUTH',
  },
});

export const getOAuthProviderConfig = (provider) => {
  const base = OAUTH_PROVIDERS[provider];
  if (!base) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported OAuth provider.', 400);
  }

  const prefix = base.envPrefix;
  return {
    ...base,
    enabled: Boolean(env.OAUTH_ENABLED && env[`${prefix}_ENABLED`]),
    clientId: env[`${prefix}_CLIENT_ID`],
    clientSecret: env[`${prefix}_CLIENT_SECRET`],
    redirectUri: env[`${prefix}_REDIRECT_URI`],
  };
};

export const assertOAuthProviderConfigured = (provider) => {
  const config = getOAuthProviderConfig(provider);
  if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'This sign-in provider is temporarily unavailable.', 503);
  }
  return config;
};

const parseJsonResponse = async (response, provider) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Provider error pages can be non-JSON. Keep the downstream error safe.
  }

  if (!response.ok) {
    throw new AppError(errorCodes.PROVIDER_BAD_RESPONSE, `${provider} sign-in failed safely.`, 502);
  }

  return payload;
};

const fetchWithProviderTimeout = async ({ url, options = {}, fetchImpl = fetch, provider }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OAUTH_PROVIDER_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch {
    throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, `${provider} sign-in provider is temporarily unavailable.`, 503);
  } finally {
    clearTimeout(timeout);
  }
};

export const buildOAuthAuthorizationUrl = ({ provider, state }) => {
  const config = assertOAuthProviderConfigured(provider);
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  if (provider === 'google') {
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
  }
  return url.toString();
};

export const exchangeOAuthCode = async ({ provider, code, fetchImpl = fetch }) => {
  const config = assertOAuthProviderConfigured(provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetchWithProviderTimeout({
    url: config.tokenEndpoint,
    fetchImpl,
    provider,
    options: {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  });
  const payload = await parseJsonResponse(response, provider);
  if (!payload?.access_token) {
    throw new AppError(errorCodes.PROVIDER_BAD_RESPONSE, `${provider} sign-in failed safely.`, 502);
  }
  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || 'Bearer',
  };
};

const fetchOAuthJson = async ({ url, accessToken, fetchImpl = fetch, provider }) => {
  const response = await fetchWithProviderTimeout({
    url,
    fetchImpl,
    provider,
    options: {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Findly OAuth',
      },
    },
  });
  return parseJsonResponse(response, provider);
};

const safeAvatarUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

export const normalizeGoogleIdentity = (profile) => ({
  provider: 'google',
  providerAccountId: String(profile?.sub || ''),
  email: profile?.email ? String(profile.email).toLowerCase() : null,
  emailVerified: profile?.email_verified === true,
  displayName: profile?.name ? String(profile.name).slice(0, 160) : null,
  avatarUrl: safeAvatarUrl(profile?.picture),
});

export const normalizeGithubIdentity = ({ profile, emails = [] }) => {
  const primaryVerified = emails.find((email) => email?.primary && email?.verified && email?.email);
  return {
    provider: 'github',
    providerAccountId: profile?.id != null ? String(profile.id) : '',
    email: primaryVerified?.email ? String(primaryVerified.email).toLowerCase() : null,
    emailVerified: Boolean(primaryVerified),
    displayName: String(profile?.name || profile?.login || '').slice(0, 160) || null,
    avatarUrl: safeAvatarUrl(profile?.avatar_url),
  };
};

export const normalizeDiscordIdentity = (profile) => {
  const avatarUrl = profile?.avatar
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(profile.id)}/${encodeURIComponent(profile.avatar)}.png`
    : null;
  return {
    provider: 'discord',
    providerAccountId: String(profile?.id || ''),
    email: profile?.email ? String(profile.email).toLowerCase() : null,
    emailVerified: profile?.verified === true,
    displayName: String(profile?.global_name || profile?.username || '').slice(0, 160) || null,
    avatarUrl: safeAvatarUrl(avatarUrl),
  };
};

export const fetchOAuthIdentity = async ({ provider, accessToken, fetchImpl = fetch }) => {
  const config = assertOAuthProviderConfigured(provider);
  if (provider === 'google') {
    return normalizeGoogleIdentity(await fetchOAuthJson({
      url: config.userinfoEndpoint,
      accessToken,
      fetchImpl,
      provider,
    }));
  }

  if (provider === 'github') {
    const profile = await fetchOAuthJson({
      url: config.userinfoEndpoint,
      accessToken,
      fetchImpl,
      provider,
    });
    const emails = await fetchOAuthJson({
      url: config.emailEndpoint,
      accessToken,
      fetchImpl,
      provider,
    });
    return normalizeGithubIdentity({ profile, emails: Array.isArray(emails) ? emails : [] });
  }

  if (provider === 'discord') {
    return normalizeDiscordIdentity(await fetchOAuthJson({
      url: config.userinfoEndpoint,
      accessToken,
      fetchImpl,
      provider,
    }));
  }

  throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported OAuth provider.', 400);
};
