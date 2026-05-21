import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4136';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_oauth_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_oauth_test_csrf';
process.env.APP_URL ??= 'http://localhost:4000';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.OAUTH_ENABLED = 'true';
process.env.OAUTH_STATE_TTL_MINUTES = '10';
process.env.OAUTH_ALLOWED_RETURN_PATHS = '/dashboard,/settings,/billing';
process.env.OAUTH_DEFAULT_SUCCESS_PATH = '/dashboard';
process.env.OAUTH_FAILURE_PATH = '/auth';
process.env.GOOGLE_OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/google/callback';
process.env.GITHUB_OAUTH_ENABLED = 'true';
process.env.GITHUB_OAUTH_CLIENT_ID = 'github-client';
process.env.GITHUB_OAUTH_CLIENT_SECRET = 'github-secret';
process.env.GITHUB_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/github/callback';
process.env.DISCORD_OAUTH_ENABLED = 'true';
process.env.DISCORD_OAUTH_CLIENT_ID = 'discord-client';
process.env.DISCORD_OAUTH_CLIENT_SECRET = 'discord-secret';
process.env.DISCORD_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/discord/callback';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.LOG_LEVEL ??= 'silent';

let createApp;
let prisma;
let app;

const unique = Date.now().toString(36);
const password = 'Secure12345@#$';
const createdEmails = [];

const providerProfile = ({ provider, email, verified = true, id = `${provider}-${unique}`, name = `${provider} User` }) => {
  if (provider === 'google') {
    return { sub: id, email, email_verified: verified, name, picture: 'https://example.com/avatar.png' };
  }
  if (provider === 'github') {
    return {
      profile: { id, login: name.toLowerCase().replace(/\s+/g, '-'), name, avatar_url: 'https://example.com/github.png' },
      emails: [{ email, primary: true, verified }],
    };
  }
  return { id, email, verified, global_name: name, username: name.toLowerCase(), avatar: null };
};

const mockOAuthFetch = ({ provider, email, verified = true, id }) => {
  const identity = providerProfile({ provider, email, verified, id });
  global.fetch = vi.fn(async (url) => {
    const urlText = String(url);
    if (urlText.includes('/token') || urlText.includes('/access_token')) {
      return Response.json({ access_token: `access-${provider}`, token_type: 'Bearer' });
    }
    if (provider === 'github' && urlText.endsWith('/user')) {
      return Response.json(identity.profile);
    }
    if (provider === 'github' && urlText.endsWith('/user/emails')) {
      return Response.json(identity.emails);
    }
    return Response.json(identity);
  });
};

const startOAuth = async (provider = 'google', returnTo = '/dashboard') => {
  const response = await request(app)
    .get(`/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`)
    .expect(302);
  const location = response.headers.location;
  const state = new URL(location).searchParams.get('state');
  expect(state).toBeTruthy();
  return { location, state };
};

const callbackOAuth = (provider, state) => request.agent(app)
  .get(`/api/auth/oauth/${provider}/callback?code=test-code&state=${encodeURIComponent(state)}`);

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  app = createApp();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.oAuthState.deleteMany({ where: { provider: { in: ['google', 'github', 'discord'] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } }).catch(() => {});
  await prisma.$disconnect();
  vi.restoreAllMocks();
});

describe('OAuth authentication', () => {
  it('OAuth start redirects to provider URL and stores hashed state', async () => {
    const { location, state } = await startOAuth('google', '/dashboard');

    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('client_id=google-client');
    expect(location).not.toContain('google-secret');

    const states = await prisma.oAuthState.findMany({ where: { provider: 'google' }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(states[0].stateHash).toHaveLength(64);
    expect(states[0].stateHash).not.toBe(state);
    expect(states[0].returnTo).toBe('/dashboard');
  });

  it('creates a verified OAuth user, workspace, credits, and existing session cookie', async () => {
    const email = `oauth.google.${unique}@findly.local`;
    createdEmails.push(email);
    mockOAuthFetch({ provider: 'google', email, verified: true, id: `google-${unique}` });
    const { state } = await startOAuth('google');

    const agent = await callbackOAuth('google', state).expect(302);
    expect(agent.headers.location).toBe('http://localhost:5173/dashboard');
    expect(agent.headers['set-cookie']?.join(';')).toContain(process.env.COOKIE_NAME);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { oauthAccounts: true, workspaceMembers: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.passwordHash).toBeNull();
    expect(user.role).toBe('USER');
    expect(user.oauthAccounts).toHaveLength(1);
    expect(user.workspaceMembers).toHaveLength(1);
    expect(user.creditsBalance).toBe(50);

    const me = await request.agent(app)
      .set('Cookie', agent.headers['set-cookie'])
      .get('/api/auth/me')
      .expect(200);
    expect(me.body.data.user.email).toBe(email);
  });

  it('repeated OAuth login reuses linked account without duplicate workspace', async () => {
    const email = `oauth.repeat.${unique}@findly.local`;
    createdEmails.push(email);
    mockOAuthFetch({ provider: 'discord', email, verified: true, id: `discord-repeat-${unique}` });
    const first = await startOAuth('discord');
    await callbackOAuth('discord', first.state).expect(302);

    mockOAuthFetch({ provider: 'discord', email, verified: true, id: `discord-repeat-${unique}` });
    const second = await startOAuth('discord');
    await callbackOAuth('discord', second.state).expect(302);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { oauthAccounts: true, workspaceMembers: true },
    });
    expect(user.oauthAccounts).toHaveLength(1);
    expect(user.workspaceMembers).toHaveLength(1);
  });

  it('links verified provider email to existing password user and preserves password login', async () => {
    const email = `oauth.link.${unique}@findly.local`;
    createdEmails.push(email);
    await request(app).post('/api/auth/register').send({ name: 'Password User', email, password }).expect(201);
    await prisma.user.update({ where: { email }, data: { emailVerified: true, emailVerifiedAt: new Date() } });

    mockOAuthFetch({ provider: 'github', email, verified: true, id: `github-link-${unique}` });
    const { state } = await startOAuth('github');
    await callbackOAuth('github', state).expect(302);

    const user = await prisma.user.findUnique({ where: { email }, include: { oauthAccounts: true } });
    expect(user.oauthAccounts).toHaveLength(1);
    expect(user.passwordHash).toBeTruthy();

    await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  });

  it('rejects callback replay and provider mismatch safely', async () => {
    const email = `oauth.replay.${unique}@findly.local`;
    createdEmails.push(email);
    mockOAuthFetch({ provider: 'google', email, verified: true, id: `google-replay-${unique}` });
    const { state } = await startOAuth('google');
    await callbackOAuth('google', state).expect(302);

    const replay = await callbackOAuth('google', state).expect(302);
    expect(replay.headers.location).toContain('authError=oauth_invalid_state');

    const mismatch = await startOAuth('google');
    const mismatchResponse = await callbackOAuth('discord', mismatch.state).expect(302);
    expect(mismatchResponse.headers.location).toContain('authError=oauth_invalid_state');
  });

  it('rejects missing or unverified provider email without creating a user', async () => {
    const unverifiedEmail = `oauth.unverified.${unique}@findly.local`;
    mockOAuthFetch({ provider: 'google', email: unverifiedEmail, verified: false, id: `google-unverified-${unique}` });
    const unverified = await startOAuth('google');
    const unverifiedResponse = await callbackOAuth('google', unverified.state).expect(302);
    expect(unverifiedResponse.headers.location).toContain('authError=oauth_email_unverified');
    expect(await prisma.user.findUnique({ where: { email: unverifiedEmail } })).toBeNull();

    mockOAuthFetch({ provider: 'discord', email: null, verified: true, id: `discord-missing-${unique}` });
    const missing = await startOAuth('discord');
    const missingResponse = await callbackOAuth('discord', missing.state).expect(302);
    expect(missingResponse.headers.location).toContain('authError=oauth_email_missing');
  });
});
