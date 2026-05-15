import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_test_csrf';
process.env.SESSION_TTL_DAYS ??= '30';
process.env.BCRYPT_ROUNDS ??= '10';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SEARCH_RATE_LIMIT_MAX = '1000';
process.env.ANALYSIS_RATE_LIMIT_MAX = '1000';
process.env.JSON_BODY_LIMIT ??= '100kb';
process.env.URLENCODED_BODY_LIMIT ??= '50kb';
process.env.TRUST_PROXY ??= '0';
process.env.MAX_ACTIVE_SESSIONS ??= '10';
process.env.EMAIL_VERIFICATION_TTL_MINUTES ??= '60';
process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS ??= '60';
process.env.APP_URL ??= 'http://localhost:4000';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.EMAIL_FROM ??= 'Findly <test@findly.local>';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATASET_IMPORT_DIR ??= './tests/fixtures/dataset-import';
process.env.GOOGLE_PLACES_API_KEY = '';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for integration tests.');
}

const unique = Date.now().toString(36);
const email = `test.${unique}@findly.local`;
const password = 'Secure12345@#$';

let createApp;
let prisma;
let getTestOutbox;
let clearTestOutbox;
let primaryVerificationToken;

const getCsrfToken = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const registerAccount = async ({ agent = request.agent(createApp()), userEmail, name = 'Backend Test' }) => {
  const response = await agent
    .post('/api/auth/register')
    .send({
      name,
      email: userEmail,
      password,
    })
    .expect(201);

  return { agent, response };
};

const verificationTokenFor = (userEmail) => {
  const emailRecord = [...getTestOutbox()].reverse().find((item) => item.to === userEmail);
  expect(emailRecord).toBeTruthy();
  const url = new URL(emailRecord.verificationUrl);
  return url.searchParams.get('token');
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ getTestOutbox, clearTestOutbox } = await import('../../src/modules/mail/mail.service.js'));
});

beforeEach(() => {
  clearTestOutbox();
});

afterAll(async () => {
  await prisma.leadCatalog.deleteMany({
    where: {
      sourceFile: { in: ['sample-leads.csv', 'location-normalization-test.csv'] },
    },
  }).catch(() => {});
  await prisma.datasetImport.deleteMany({
    where: {
      fileName: 'sample-leads.csv',
    },
  }).catch(() => {});
  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: `test.${unique}`,
      },
    },
  });
  await prisma.$disconnect();
});

describe('Findly auth, verification, and foundation API', () => {
  it('rejects unauthenticated protected routes safely', async () => {
    const response = await request(createApp()).get('/api/auth/me').expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  });

  it('rejects malformed JSON safely', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not-json')
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects invalid registration input', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        name: 'A',
        email: 'not-an-email',
        password: 'password',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registers an unverified user, creates workspace, sends verification, and grants no credits yet', async () => {
    const { response } = await registerAccount({ userEmail: email });

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.emailVerified).toBe(false);
    expect(response.body.data.user.creditsBalance).toBe(0);
    expect(response.body.data.workspace.name).toBe("Backend Test's workspace");
    primaryVerificationToken = verificationTokenFor(email);
    expect(primaryVerificationToken).toBeTruthy();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        creditLedger: true,
        workspaceMembers: true,
        sessions: true,
        emailVerificationTokens: true,
      },
    });

    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash.startsWith('$2')).toBe(true);
    expect(user.emailVerified).toBe(false);
    expect(user.creditsBalance).toBe(0);
    expect(user.initialCreditsGrantedAt).toBeNull();
    expect(user.creditLedger).toHaveLength(0);
    expect(user.workspaceMembers).toHaveLength(1);
    expect(user.sessions[0].tokenHash).toHaveLength(64);
    expect(user.emailVerificationTokens).toHaveLength(1);
    expect(user.emailVerificationTokens[0].tokenHash).toHaveLength(64);
  });

  it('blocks duplicate email safely', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        name: 'Backend Test',
        email,
        password,
      })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns a generic error for wrong password', async () => {
    const response = await request(createApp())
      .post('/api/auth/login')
      .send({
        email,
        password: 'Wrong12345',
      })
      .expect(401);

    expect(response.body.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password.',
    });
  });

  it('creates a long TTL session when remember=true and short TTL when remember=false', async () => {
    // 1. Login with remember=true (default)
    const agentLong = request.agent(createApp());
    await agentLong.post('/api/auth/login').send({ email, password, remember: true }).expect(200);

    // 2. Login with remember=false
    const agentShort = request.agent(createApp());
    await agentShort.post('/api/auth/login').send({ email, password, remember: false }).expect(200);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { sessions: { orderBy: { createdAt: 'desc' } } },
    });

    const shortSession = user.sessions[0];
    const longSession = user.sessions[1];

    const shortTTLHours = (shortSession.expiresAt - shortSession.createdAt) / (1000 * 60 * 60);
    const longTTLDays = (longSession.expiresAt - longSession.createdAt) / (1000 * 60 * 60 * 24);

    expect(Math.round(shortTTLHours)).toBe(Number(process.env.SESSION_SHORT_TTL_HOURS || 2));
    expect(Math.round(longTTLDays)).toBe(Number(process.env.SESSION_TTL_DAYS || 30));
  });

  it('verifies email, grants initial credits once, but does not create a login session from the email link', async () => {
    const token = primaryVerificationToken;

    const verificationAgent = request.agent(createApp());
    const verifyResponse = await verificationAgent
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);

    expect(verifyResponse.body.data.user.emailVerified).toBe(true);
    expect(verifyResponse.body.data.user.creditsBalance).toBe(50);
    expect(verifyResponse.body.data.creditsGranted).toBe(true);
    expect(verifyResponse.body.data.authenticated).toBe(false);
    expect(verifyResponse.body.data.nextAction).toBe('LOGIN_REQUIRED');
    expect(verifyResponse.headers['set-cookie']).toBeUndefined();

    await verificationAgent.get('/api/dashboard').expect(401);

    const duplicateVerifyResponse = await request(createApp())
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);

    expect(duplicateVerifyResponse.body.data.alreadyVerified).toBe(true);
    expect(duplicateVerifyResponse.body.data.creditsGranted).toBe(false);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        creditLedger: true,
      },
    });

    expect(user.emailVerified).toBe(true);
    expect(user.creditsBalance).toBe(50);
    expect(user.initialCreditsGrantedAt).toBeTruthy();
    expect(user.creditLedger).toHaveLength(1);
    expect(user.creditLedger[0].balanceAfter).toBe(50);

    const agent = request.agent(createApp());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const dashboardResponse = await agent.get('/api/dashboard').expect(200);

    expect(dashboardResponse.body.data.user.emailVerified).toBe(true);
    expect(dashboardResponse.body.data.credits.balance).toBe(50);
  });

  it('verifyEmail with an active session for the same user returns ENTER_DASHBOARD and authenticated=true', async () => {
    // Register & get a fresh verification token for a new account.
    const sessionEmail = `test.${unique}.withsession@findly.local`;
    const { agent: sessionAgent } = await registerAccount({ userEmail: sessionEmail, name: 'Session User' });
    const token = verificationTokenFor(sessionEmail);

    // Agent already has a session cookie from registration.
    const verifyResponse = await sessionAgent
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);

    expect(verifyResponse.body.data.authenticated).toBe(true);
    expect(verifyResponse.body.data.nextAction).toBe('ENTER_DASHBOARD');
    expect(verifyResponse.body.data.user.emailVerified).toBe(true);
  });

  it('verifyEmail without a session cookie returns LOGIN_REQUIRED and authenticated=false', async () => {
    const noSessionEmail = `test.${unique}.nosession@findly.local`;
    await registerAccount({ userEmail: noSessionEmail, name: 'No Session User' });
    const token = verificationTokenFor(noSessionEmail);

    // Fresh agent with no cookie.
    const verifyResponse = await request(createApp())
      .post('/api/auth/verify-email')
      .send({ token })
      .expect(200);

    expect(verifyResponse.body.data.authenticated).toBe(false);
    expect(verifyResponse.body.data.nextAction).toBe('LOGIN_REQUIRED');
  });

  it('verifyEmail with a session belonging to a different user returns LOGIN_REQUIRED', async () => {
    // Register user A and get their session.
    const userAEmail = `test.${unique}.sessiona@findly.local`;
    const { agent: agentA } = await registerAccount({ userEmail: userAEmail, name: 'User A' });

    // Register user B separately (fresh agent, no session).
    const userBEmail = `test.${unique}.sessionb@findly.local`;
    await registerAccount({ userEmail: userBEmail, name: 'User B' });
    const tokenB = verificationTokenFor(userBEmail);

    // Use agentA's session cookie to verify user B's token.
    const verifyResponse = await agentA
      .post('/api/auth/verify-email')
      .send({ token: tokenB })
      .expect(200);

    // Session belongs to user A, token belongs to user B — must not grant dashboard.
    expect(verifyResponse.body.data.authenticated).toBe(false);
    expect(verifyResponse.body.data.nextAction).toBe('LOGIN_REQUIRED');
  });

  it('verifyEmail with a garbage session cookie does not crash and returns LOGIN_REQUIRED', async () => {
    const garbageEmail = `test.${unique}.garbage@findly.local`;
    await registerAccount({ userEmail: garbageEmail, name: 'Garbage Cookie' });
    const token = verificationTokenFor(garbageEmail);

    const { env: testEnv } = await import('../../src/config/env.js');

    const verifyResponse = await request(createApp())
      .post('/api/auth/verify-email')
      .set('Cookie', `${testEnv.COOKIE_NAME}=totally-invalid-garbage-token`)
      .send({ token })
      .expect(200);

    expect(verifyResponse.body.data.authenticated).toBe(false);
    expect(verifyResponse.body.data.nextAction).toBe('LOGIN_REQUIRED');
  });

  it('rejects invalid and expired verification tokens', async () => {
    await request(createApp())
      .post('/api/auth/verify-email')
      .send({ token: 'invalid-token-that-is-long-enough-to-pass-validation' })
      .expect(400);

    const expiredEmail = `test.${unique}.expired@findly.local`;
    await registerAccount({ userEmail: expiredEmail, name: 'Expired Token' });
    const expiredToken = verificationTokenFor(expiredEmail);
    const { hashEmailVerificationToken } = await import('../../src/utils/crypto.js');

    await prisma.emailVerificationToken.update({
      where: {
        tokenHash: hashEmailVerificationToken(expiredToken),
      },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const expiredResponse = await request(createApp())
      .post('/api/auth/verify-email')
      .send({ token: expiredToken })
      .expect(410);

    expect(expiredResponse.body.error.code).toBe('VERIFICATION_TOKEN_EXPIRED');
  });

  it('blocks dashboard for unverified users and supports resend with CSRF', async () => {
    const unverifiedEmail = `test.${unique}.unverified@findly.local`;
    const { agent } = await registerAccount({ userEmail: unverifiedEmail, name: 'Unverified User' });

    const dashboardResponse = await agent.get('/api/dashboard').expect(403);
    expect(dashboardResponse.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const immediateCsrfToken = await getCsrfToken(agent);
    const immediateResendResponse = await agent
      .post('/api/auth/resend-verification')
      .set('X-CSRF-Token', immediateCsrfToken)
      .send({})
      .expect(429);
    expect(immediateResendResponse.body.error.code).toBe('VERIFICATION_RESEND_RATE_LIMITED');

    await prisma.user.update({
      where: { email: unverifiedEmail },
      data: {
        lastVerificationEmailSentAt: new Date(Date.now() - 120_000),
      },
    });

    const csrfToken = await getCsrfToken(agent);
    const resendResponse = await agent
      .post('/api/auth/resend-verification')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(resendResponse.body.data.alreadyVerified).toBe(false);
    expect(verificationTokenFor(unverifiedEmail)).toBeTruthy();
  });

  it('logs in, returns current user, validates params, and logs out with CSRF protection', async () => {
    const agent = request.agent(createApp());

    await agent
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const meResponse = await agent.get('/api/auth/me').expect(200);
    expect(meResponse.body.data.user.passwordHash).toBeUndefined();
    expect(meResponse.body.data.user.emailVerified).toBe(true);
    expect(meResponse.body.data.workspace.id).toBeTruthy();

    const creditsResponse = await agent.get('/api/credits').expect(200);
    expect(creditsResponse.body.data.credits.balance).toBe(50);

    const estimateResponse = await agent
      .get('/api/credits/estimate-search?sources=GOOGLE_MAPS,REDDIT&maxResults=5&analysis=true')
      .expect(200);
    expect(estimateResponse.body.data.estimatedCredits).toBeGreaterThan(0);
    expect(estimateResponse.body.data.trustedForCharge).toBe(false);
    expect(estimateResponse.body.data.sourceAvailability.find((source) => source.source === 'REDDIT').available).toBe(false);

    const historyResponse = await agent.get('/api/credits/history?page=1&limit=10').expect(200);
    expect(historyResponse.body.data.ledger.items.length).toBe(1);

    await agent.delete('/api/sessions/not-a-cuid').expect(403);

    const csrfToken = await getCsrfToken(agent);

    const invalidParamResponse = await agent
      .delete('/api/sessions/not-a-cuid')
      .set('X-CSRF-Token', csrfToken)
      .expect(400);

    expect(invalidParamResponse.body.error.code).toBe('VALIDATION_ERROR');

    await agent.post('/api/auth/logout').expect(403);

    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    await agent.get('/api/auth/me').expect(401);
  });

  it('updates dashboard settings with safe envelopes and does not fake two-factor enablement', async () => {
    const settingsEmail = `test.${unique}.settings@findly.local`;
    const { agent } = await registerAccount({ userEmail: settingsEmail, name: 'Settings User' });
    const token = verificationTokenFor(settingsEmail);
    await request(createApp()).post('/api/auth/verify-email').send({ token }).expect(200);
    await agent.post('/api/auth/login').send({ email: settingsEmail, password }).expect(200);

    const csrfToken = await getCsrfToken(agent);
    const meResponse = await agent.get('/api/auth/me').expect(200);
    const workspaceId = meResponse.body.data.workspace.id;

    const profileResponse = await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Updated Settings User',
        notifyReports: false,
        notifySecurity: true,
        notifyMarketing: true,
      })
      .expect(200);

    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.user.name).toBe('Updated Settings User');
    expect(profileResponse.body.data.user.passwordHash).toBeUndefined();
    expect(profileResponse.body.data.user.notifyReports).toBe(false);

    const fake2FAResponse = await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ twoFactorEnabled: true })
      .expect(400);
    expect(fake2FAResponse.body.error.code).toBe('VALIDATION_ERROR');

    const workspaceResponse = await agent
      .patch(`/api/workspaces/${workspaceId}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'Updated Workspace' })
      .expect(200);
    expect(workspaceResponse.body.data.workspace.name).toBe('Updated Workspace');

    const passwordResponse = await agent
      .patch('/api/auth/password')
      .set('X-CSRF-Token', csrfToken)
      .send({
        currentPassword: password,
        newPassword: 'NewSecure12345@#$',
      })
      .expect(200);
    expect(passwordResponse.body.success).toBe(true);

    await request(createApp())
      .post('/api/auth/login')
      .send({ email: settingsEmail, password })
      .expect(401);
    await request(createApp())
      .post('/api/auth/login')
      .send({ email: settingsEmail, password: 'NewSecure12345@#$' })
      .expect(200);
  });

  it('exposes safe readiness/source status and blocks unconfigured campaign runs cleanly', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);

    const meResponse = await agent.get('/api/auth/me').expect(200);
    const workspaceId = meResponse.body.data.workspace.id;

    const readyResponse = await request(createApp()).get('/api/ready').expect(200);
    expect(readyResponse.body.data.database).toBe('ok');
    expect(JSON.stringify(readyResponse.body.data)).not.toContain(process.env.GOOGLE_PLACES_API_KEY || 'not-a-real-key');

    const sourceResponse = await request(createApp()).get('/api/sources/status').expect(200);
    const googleMaps = sourceResponse.body.data.sources.find((source) => source.key === 'GOOGLE_MAPS');
    const website = sourceResponse.body.data.sources.find((source) => source.key === 'WEBSITE');
    const reddit = sourceResponse.body.data.sources.find((source) => source.key === 'REDDIT');
    const localDataset = sourceResponse.body.data.sources.find((source) => source.key === 'LOCAL_DATASET');
    expect(googleMaps.requiresApiKey).toBe(true);
    expect(googleMaps).not.toHaveProperty('apiKey');
    expect(website.available).toBe(true);
    expect(website.estimatedUseCase).toContain('metadata');
    expect(reddit).toBeTruthy();
    expect(reddit.available).toBe(false);
    expect(reddit.requiresApiKey).toBe(true);
    expect(reddit.requiresApproval).toBe(true);
    expect(localDataset).toBeTruthy();
    expect(localDataset.available).toBe(true);
    expect(localDataset.requiresApiKey).toBe(false);
    expect(JSON.stringify(localDataset)).not.toContain('sample-leads.csv');
    if (process.env.REDDIT_CLIENT_SECRET) {
      expect(JSON.stringify(reddit)).not.toContain(process.env.REDDIT_CLIENT_SECRET);
    }

    const csrfToken = await getCsrfToken(agent);
    const campaignResponse = await agent
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId,
        name: `Campaign ${unique}`,
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        sources: ['REDDIT'],
        requestedLimit: 3,
      })
      .expect(201);

    const runResponse = await agent
      .post(`/api/search/campaigns/${campaignResponse.body.data.campaign.id}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(400);

    expect(runResponse.body.error.code).toBe('SOURCE_NOT_CONFIGURED');

    const failedJob = await prisma.job.findFirst({
      where: { campaignId: campaignResponse.body.data.campaign.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(failedJob.status).toBe('FAILED');
    expect(failedJob.errorCode).toBe('SOURCE_NOT_CONFIGURED');

    const statusResponse = await agent
      .get(`/api/search/campaigns/${campaignResponse.body.data.campaign.id}/status`)
      .expect(200);
    expect(statusResponse.body.data.campaign.status).toBe('FAILED');
    expect(statusResponse.body.data.campaign.job.status).toBe('FAILED');

    const redditCampaignResponse = await agent
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId,
        name: `Reddit Campaign ${unique}`,
        query: 'need website in Amman',
        country: 'Jordan',
        city: 'Amman',
        sources: ['REDDIT'],
        filters: {
          keywords: ['need website', 'online menu'],
          subreddits: ['jordan', 'smallbusiness'],
          excludeNsfw: true,
        },
        requestedLimit: 3,
      })
      .expect(201);

    const redditRunResponse = await agent
      .post(`/api/search/campaigns/${redditCampaignResponse.body.data.campaign.id}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(400);
    expect(redditRunResponse.body.error.code).toBe('SOURCE_NOT_CONFIGURED');

    const redditJob = await prisma.job.findFirst({
      where: { campaignId: redditCampaignResponse.body.data.campaign.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(redditJob.status).toBe('FAILED');

    const { retryJobIfAllowed } = await import('../../src/modules/jobs/jobQueue.service.js');
    const retriedJob = await retryJobIfAllowed({ jobId: redditJob.id });
    expect(retriedJob.status).toBe('QUEUED');

    const jobResponse = await agent.get(`/api/jobs/${redditJob.id}`).expect(200);
    expect(jobResponse.body.data.job.id).toBe(redditJob.id);

    const otherUser = await prisma.user.create({
      data: {
        name: `Foreign ${unique}`,
        email: `test.${unique}.foreign@findly.local`,
        passwordHash: 'not-a-real-login-password-hash',
        emailVerified: true,
      },
    });
    const otherWorkspace = await prisma.workspace.create({
      data: {
        ownerId: otherUser.id,
        name: 'Foreign workspace',
      },
    });
    await prisma.workspaceMember.create({
      data: {
        userId: otherUser.id,
        workspaceId: otherWorkspace.id,
        role: 'OWNER',
      },
    });
    const foreignJob = await prisma.job.create({
      data: {
        userId: otherUser.id,
        workspaceId: otherWorkspace.id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'QUEUED',
      },
    });
    await agent.get(`/api/jobs/${foreignJob.id}`).expect(404);
  });

  it('dry-runs and imports local dataset rows with normalization and dedupe', async () => {
    const { importDatasetFile } = await import('../../src/modules/datasets/datasetImport.service.js');
    const { normalizeInstagram, normalizeUrlKey } = await import('../../src/modules/datasets/datasetImport.mapper.js');
    const {
      getSupportedJordanGovernorates,
      isNeighborhoodOrStreet,
      mapRawLocationToGovernorate,
      normalizeJordanLocation,
    } = await import('../../src/modules/search/locationNormalization.js');

    expect(normalizeInstagram('@Sample_Cafe').instagramUsername).toBe('sample_cafe');
    expect(normalizeUrlKey('https://www.example-shop.test/path/?utm=test')).toBe('example-shop.test/path');
    expect(getSupportedJordanGovernorates()).toEqual(['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Balqa', 'Madaba', 'Karak', 'Tafilah', 'Maan', 'Mafraq', 'Jerash', 'Ajloun']);
    expect(mapRawLocationToGovernorate('Sweifieh')).toBe('Amman');
    expect(mapRawLocationToGovernorate('Khalda')).toBe('Amman');
    expect(mapRawLocationToGovernorate('Um Uthaina')).toBe('Amman');
    expect(normalizeJordanLocation('Jordan / Online')).toBe('Jordan-wide');
    expect(isNeighborhoodOrStreet('Wasfi Al-Tal St, Amman')).toBe(true);

    const fixturePath = fileURLToPath(new URL('../fixtures/dataset-import/sample-leads.csv', import.meta.url));
    const dryRun = await importDatasetFile({ filePath: fixturePath, dryRun: true });
    expect(dryRun.totalRows).toBe(3);
    expect(dryRun.importedRows).toBe(2);
    expect(dryRun.duplicateRows).toBe(1);

    const agent = request.agent(createApp());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const meResponse = await agent.get('/api/auth/me').expect(200);
    const workspaceId = meResponse.body.data.workspace.id;

    const importSummary = await importDatasetFile({
      filePath: fixturePath,
      dryRun: false,
    });

    expect(importSummary.importedRows).toBe(2);
    expect(importSummary.duplicateRows).toBe(1);
    expect(importSummary.leadListId).toBeNull();

    const importedLead = await prisma.leadCatalog.findFirst({
      where: {
        sourceFile: 'sample-leads.csv',
        instagramUsername: 'sample_cafe',
      },
    });
    expect(importedLead).toBeTruthy();
    expect(importedLead.source).toBe('INSTAGRAM_DATASET');
    expect(importedLead.detectedSignals).toContain('HAS_INSTAGRAM_NO_WEBSITE');
    expect(importedLead.normalizedFingerprint).toHaveLength(64);

    await prisma.leadCatalog.create({
      data: {
        businessName: `Sweifieh Test Cafe ${unique}`,
        category: 'Cafe',
        country: 'Jordan',
        city: 'Sweifieh',
        instagramUsername: `sweifieh_test_${unique}`,
        source: 'INSTAGRAM_DATASET',
        sourceFile: 'location-normalization-test.csv',
        sourceId: `sweifieh-test-${unique}`,
        detectedSignals: ['HAS_INSTAGRAM', 'NO_WEBSITE', 'HAS_INSTAGRAM_NO_WEBSITE', 'DATASET_IMPORTED'],
        normalizedFingerprint: `location-normalization-${unique}`,
        importedAt: new Date(),
      },
    });

    const leadListResponse = await agent.get('/api/search/lists?limit=20').expect(200);
    expect(leadListResponse.body.data.lists.some((list) => list.id === importSummary.leadListId)).toBe(false);

    const sourceStatusResponse = await agent.get('/api/search/sources/status').expect(200);
    const googleMaps = sourceStatusResponse.body.data.sources.find((source) => source.key === 'GOOGLE_MAPS');
    const localDataset = sourceStatusResponse.body.data.sources.find((source) => source.key === 'LOCAL_DATASET');
    expect(localDataset.searchable).toBe(true);
    expect(localDataset.importedLeadCount).toBeGreaterThanOrEqual(2);
    expect(googleMaps.fallbackAvailable).toBe(true);

    const optionsResponse = await agent.get('/api/search/options').expect(200);
    expect(optionsResponse.body.data.services).toContain('Website Development');
    expect(optionsResponse.body.data.businessTypes).toContain('Cafes');
    expect(optionsResponse.body.data.countries).toContain('Jordan');
    expect(optionsResponse.body.data.governorates).toEqual(['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Balqa', 'Madaba', 'Karak', 'Tafilah', 'Maan', 'Mafraq', 'Jerash', 'Ajloun']);
    expect(optionsResponse.body.data.cities).toContain('Amman');
    expect(optionsResponse.body.data.cities).not.toContain('Sweifieh');
    expect(optionsResponse.body.data.cities).not.toContain('Khalda');
    expect(optionsResponse.body.data.cities).not.toContain('Jordan / Online');
    expect(optionsResponse.body.data.cities).not.toContain('Multi-Governorate');
    expect(optionsResponse.body.data.searchGoals).toContain('Find businesses without websites');
    expect(optionsResponse.body.data.datasetStats.totalLeads).toBeGreaterThanOrEqual(2);

    const csrfToken = await getCsrfToken(agent);
    const balanceBeforeFallback = (await agent.get('/api/credits').expect(200)).body.data.credits.balance;
    const campaignResponse = await agent
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId,
        name: `Dataset fallback ${unique}`,
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['GOOGLE_MAPS'],
        filters: { goal: 'Find businesses without websites' },
        requestedLimit: 100,
      })
      .expect(201);

    const runResponse = await agent
      .post(`/api/search/campaigns/${campaignResponse.body.data.campaign.id}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(runResponse.body.data.fallbackUsed).toBe(true);
    expect(runResponse.body.data.sourceRequested).toBe('GOOGLE_MAPS');
    expect(runResponse.body.data.sourceUsed).toBe('LOCAL_DATASET');
    expect(runResponse.body.data.fallbackReason).toBe('GOOGLE_MAPS_NOT_CONNECTED');
    expect(runResponse.body.data.searchMode).toBe('LOCAL_DATASET_FALLBACK');
    expect(runResponse.body.data.creditsUsed).toBe(0);
    expect(runResponse.body.data.leadsReturned).toBeGreaterThan(0);
    expect(runResponse.body.data.leadListId).toBeTruthy();
    expect(runResponse.body.data.warning).toBe('Findly searched the best available business intelligence for this request.');
    expect(JSON.stringify(runResponse.body.data)).not.toContain('GOOGLE_PLACES_API_KEY');
    expect(runResponse.body.data.matchedLeads.some((lead) => lead.businessName === 'Sample Cafe')).toBe(true);
    expect(runResponse.body.data.matchedLeads.some((lead) => lead.businessName === `Sweifieh Test Cafe ${unique}`)).toBe(true);

    const balanceAfterFallback = (await agent.get('/api/credits').expect(200)).body.data.credits.balance;
    expect(balanceAfterFallback).toBe(balanceBeforeFallback);

    const snapshotResponse = await agent.get(`/api/search/lists/${runResponse.body.data.leadListId}`).expect(200);
    expect(snapshotResponse.body.data.list.sourceRequested).toBe('GOOGLE_MAPS');
    expect(snapshotResponse.body.data.list.sourceUsed).toBe('LOCAL_DATASET');
    expect(snapshotResponse.body.data.list.fallbackUsed).toBe(true);
    expect(snapshotResponse.body.data.list.leadCount).toBe(runResponse.body.data.leadsReturned);

    const snapshotLeadsResponse = await agent.get(`/api/search/lists/${runResponse.body.data.leadListId}/leads`).expect(200);
    expect(snapshotLeadsResponse.body.data.leads.some((lead) => lead.businessName === 'Sample Cafe')).toBe(true);
    expect(snapshotLeadsResponse.body.data.leads[0].catalogLeadId).toBeTruthy();

    const catalogCountAfterFallback = await prisma.leadCatalog.count({
      where: { sourceFile: 'sample-leads.csv' },
    });
    expect(catalogCountAfterFallback).toBe(2);
  });

  it('normalizes Reddit posts as minimized opportunity signals', async () => {
    const { RedditAdapter } = await import('../../src/modules/search/adapters/RedditAdapter.js');
    const { analyzeOpportunitySignal } = await import('../../src/modules/search/opportunitySignal.service.js');

    const adapter = new RedditAdapter({}, {
      keywords: ['need website', 'online menu'],
      serviceKeywords: ['Website Development'],
      locationKeywords: ['Amman'],
    });

    const signal = adapter.normalize({
      data: {
        id: `reddit-${unique}`,
        title: 'Looking for someone to build a restaurant website in Amman',
        selftext: 'A small restaurant needs an online menu and better booking flow.',
        author: 'public_reddit_author',
        subreddit: 'jordan',
        permalink: `/r/jordan/comments/${unique}/test`,
        created_utc: Math.floor(Date.now() / 1000),
        score: 18,
        num_comments: 7,
        over_18: false,
      },
    }, {
      keywords: ['need website', 'online menu'],
      serviceKeywords: ['Website Development'],
      locationKeywords: ['Amman'],
    });

    expect(signal.source).toBe('REDDIT');
    expect(signal.authorHash).toHaveLength(64);
    expect(signal.rawData.author).toBeUndefined();
    expect(['NEEDS_WEBSITE', 'NEEDS_DIGITAL_MENU']).toContain(signal.detectedIntent);
    expect(signal.confidence).toBeGreaterThan(50);

    const analysis = analyzeOpportunitySignal(signal, { serviceType: 'Website Development' });
    expect(analysis.signalScore).toBeGreaterThan(50);
    expect(analysis.outreachStrategy).toContain('Do not spam Reddit users');

    const agent = request.agent(createApp());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const meResponse = await agent.get('/api/auth/me').expect(200);
    const userId = meResponse.body.data.user.id;
    const workspaceId = meResponse.body.data.workspace.id;

    await prisma.opportunitySignal.create({
      data: {
        ...signal,
        userId,
        workspaceId,
      },
    });

    const signalResponse = await agent.get('/api/search/opportunity-signals?limit=10').expect(200);
    expect(signalResponse.body.data.signals.some((item) => item.source === 'REDDIT')).toBe(true);
    expect(signalResponse.body.data.signals[0]).not.toHaveProperty('authorHash');
  });

  it('protects admin operations endpoints and returns safe admin data', async () => {
    await request(createApp()).get('/api/admin/summary').expect(401);

    const normalEmail = `test.${unique}.normal-admin-denied@findly.local`;
    const { agent: normalAgent } = await registerAccount({ userEmail: normalEmail, name: 'Normal User' });
    const normalToken = verificationTokenFor(normalEmail);
    await request(createApp()).post('/api/auth/verify-email').send({ token: normalToken }).expect(200);
    await normalAgent.post('/api/auth/login').send({ email: normalEmail, password }).expect(200);
    const deniedResponse = await normalAgent.get('/api/admin/summary').expect(403);
    expect(deniedResponse.body.error.code).toBe('FORBIDDEN');

    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });

    const adminAgent = request.agent(createApp());
    await adminAgent.post('/api/auth/login').send({ email, password }).expect(200);

    const summaryResponse = await adminAgent.get('/api/admin/summary').expect(200);
    expect(summaryResponse.body.data.totals.totalUsers).toBeGreaterThan(0);
    expect(summaryResponse.body.data.totals.totalCatalogLeads).toBeGreaterThanOrEqual(0);
    expect(summaryResponse.body.data.totals.totalDatasetImports).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(summaryResponse.body.data)).not.toContain('passwordHash');
    expect(JSON.stringify(summaryResponse.body.data)).not.toContain(process.env.SESSION_SECRET);

    const usersResponse = await adminAgent.get('/api/admin/users?limit=50').expect(200);
    expect(usersResponse.body.data.users.some((item) => item.email === email)).toBe(true);
    expect(JSON.stringify(usersResponse.body.data.users)).not.toContain('passwordHash');
    expect(JSON.stringify(usersResponse.body.data.users)).not.toContain('tokenHash');

    const catalogResponse = await adminAgent.get('/api/admin/catalog/stats').expect(200);
    expect(catalogResponse.body.data).toHaveProperty('total');
    expect(catalogResponse.body.data).toHaveProperty('bySource');
    expect(catalogResponse.body.data).toHaveProperty('byGovernorate');

    const importsResponse = await adminAgent.get('/api/admin/imports?limit=10').expect(200);
    expect(importsResponse.body.data).toHaveProperty('imports');
    expect(JSON.stringify(importsResponse.body.data.imports)).not.toContain('filePath');

    const campaignsResponse = await adminAgent.get('/api/admin/campaigns?limit=10').expect(200);
    expect(campaignsResponse.body.data).toHaveProperty('campaigns');

    const securityResponse = await adminAgent.get('/api/admin/security/events?limit=10').expect(200);
    expect(securityResponse.body.data.events.some((event) => event.action === 'ADMIN_ACCESS_DENIED')).toBe(true);

    const errorsResponse = await adminAgent.get('/api/admin/errors?limit=10').expect(200);
    expect(errorsResponse.body.data.errors.some((error) => error.errorCode === 'FORBIDDEN')).toBe(true);
    expect(JSON.stringify(errorsResponse.body.data.errors)).not.toContain('SESSION_SECRET');
  });

  it('analyzes a real lead once, reuses analysis without double charging, and rejects unsafe website enrichment URLs', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/login').send({ email, password }).expect(200);

    const meResponse = await agent.get('/api/auth/me').expect(200);
    const workspaceId = meResponse.body.data.workspace.id;
    const userId = meResponse.body.data.user.id;

    const lead = await prisma.lead.create({
      data: {
        userId,
        workspaceId,
        businessName: `No Website Cafe ${unique}`,
        category: 'cafe',
        city: 'Amman',
        country: 'Jordan',
        phone: '+962799999999',
        rating: 4.6,
        reviewCount: 120,
        source: 'MANUAL',
        sourceId: `manual-${unique}`,
      },
    });

    const unsafeLead = await prisma.lead.create({
      data: {
        userId,
        workspaceId,
        businessName: `Unsafe URL ${unique}`,
        websiteUrl: 'javascript:alert(1)',
        source: 'MANUAL',
        sourceId: `unsafe-${unique}`,
      },
    });

    const beforeCredits = await agent.get('/api/credits').expect(200);
    const beforeBalance = beforeCredits.body.data.credits.balance;
    const csrfToken = await getCsrfToken(agent);

    const firstAnalysis = await agent
      .post(`/api/search/leads/${lead.id}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(firstAnalysis.body.data.creditsUsed).toBe(1);
    expect(firstAnalysis.body.data.analysis.opportunityScore).toBeGreaterThan(0);

    const secondAnalysis = await agent
      .post(`/api/search/leads/${lead.id}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(secondAnalysis.body.data.reused).toBe(true);
    expect(secondAnalysis.body.data.creditsUsed).toBe(0);

    const afterCredits = await agent.get('/api/credits').expect(200);
    expect(afterCredits.body.data.credits.balance).toBe(beforeBalance - 1);

    const enrichResponse = await agent
      .post(`/api/search/leads/${unsafeLead.id}/enrich-website`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(400);

    expect(enrichResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('admin can create and paginate catalog leads, normal users cannot', async () => {
    const adminAgent = request.agent(createApp());
    await adminAgent.post('/api/auth/login').send({ email, password }).expect(200);

    const normalEmail = `test.${unique}.normal-user@findly.local`;
    const { agent: normalAgent } = await registerAccount({ userEmail: normalEmail, name: 'Normal User' });
    const normalToken = verificationTokenFor(normalEmail);
    await request(createApp()).post('/api/auth/verify-email').send({ token: normalToken }).expect(200);
    await normalAgent.post('/api/auth/login').send({ email: normalEmail, password }).expect(200);

    // Normal user denied
    await normalAgent.get('/api/admin/catalog/leads').expect(403);
    const normalCsrf = await getCsrfToken(normalAgent);
    await normalAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', normalCsrf)
      .send({ businessName: 'Test', country: 'Jordan', sourceType: 'MANUAL_ADMIN' })
      .expect(403);

    const adminCsrf = await getCsrfToken(adminAgent);

    // Validation fails on invalid URLs/email
    const validationFailed = await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: 'Invalid Data Lead',
        country: 'Jordan',
        governorate: 'Amman',
        websiteUrl: 'not-a-url',
        email: 'invalid-email',
        sourceType: 'MANUAL_ADMIN'
      })
      .expect(400);
    expect(validationFailed.body.error.code).toBe('VALIDATION_ERROR');

    // Missing governorate for Jordan fails
    await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: 'No Gov Lead',
        country: 'Jordan',
        sourceType: 'MANUAL_ADMIN'
      })
      .expect(400);

    // Create valid lead
    const createdLead = await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: `Admin Manual Lead ${unique}`,
        category: 'Tech',
        country: 'Jordan',
        governorate: 'Amman',
        websiteUrl: 'https://example.com',
        phone: '+962799999999',
        sourceType: 'MANUAL_ADMIN'
      })
      .expect(201);
      
    expect(createdLead.body.data.lead.businessName).toBe(`Admin Manual Lead ${unique}`);
    expect(createdLead.body.data.lead.detectedSignals).toContain('HAS_WEBSITE');
    expect(createdLead.body.data.lead.detectedSignals).toContain('HAS_PHONE');
    expect(createdLead.body.data.lead.detectedSignals).toContain('MANUAL_ADMIN_ENTRY');

    // Pagination
    const listResponse = await adminAgent.get('/api/admin/catalog/leads?limit=1&page=1').expect(200);
    expect(listResponse.body.data.leads.length).toBeLessThanOrEqual(1);
    expect(listResponse.body.data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('admin can bulk import datasets via upload, normal users cannot', async () => {
    const adminAgent = request.agent(createApp());
    await adminAgent.post('/api/auth/login').send({ email, password }).expect(200);
    const adminCsrf = await getCsrfToken(adminAgent);

    const normalEmail = `test.${unique}.normal-user-import@findly.local`;
    const { agent: normalAgent } = await registerAccount({ userEmail: normalEmail, name: 'Normal User' });
    const normalToken = verificationTokenFor(normalEmail);
    await request(createApp()).post('/api/auth/verify-email').send({ token: normalToken }).expect(200);
    await normalAgent.post('/api/auth/login').send({ email: normalEmail, password }).expect(200);
    const normalCsrf = await getCsrfToken(normalAgent);

    const csvContent = Buffer.from(`Business Name,Category,City,Instagram URL\nTest Bulk Cafe ${unique},Cafe,Amman,https://instagram.com/testbulkcafe${unique}\nTest Bulk Cafe ${unique},Cafe,Amman,https://instagram.com/testbulkcafe${unique}\n`);
    
    // Normal user denied
    await normalAgent.post('/api/admin/imports/parse')
      .set('X-CSRF-Token', normalCsrf)
      .attach('file', csvContent, 'test-import.csv')
      .expect(403);

    // Invalid file type rejected
    await adminAgent.post('/api/admin/imports/parse')
      .set('X-CSRF-Token', adminCsrf)
      .attach('file', csvContent, 'test-import.txt')
      .expect(400);

    // Admin parse preview
    const parseRes = await adminAgent.post('/api/admin/imports/parse')
      .set('X-CSRF-Token', adminCsrf)
      .attach('file', csvContent, 'test-import.csv')
      .expect(200);

    expect(parseRes.body.data.fileName).toBe('test-import.csv');
    expect(parseRes.body.data.sheets[0].rowCount).toBe(2);
    expect(parseRes.body.data.sheets[0].mapping).toHaveProperty('businessName');
    
    const fileKey = parseRes.body.data.fileKey;

    // Normal user cannot commit
    await normalAgent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', normalCsrf)
      .send({ fileKey, sourceType: 'LOCAL_DATASET' })
      .expect(403);

    // Admin commit
    const commitRes = await adminAgent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', adminCsrf)
      .send({ fileKey, sourceType: 'LOCAL_DATASET' })
      .expect(200);

    const summary = commitRes.body.data.summary;
    expect(summary).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      duplicateRows: 1,
      skippedRows: 0,
      errorRows: 0
    });
    expect(summary.duplicateRows).toBe(1); // Since row 2 is identical to row 1

    // Verify it was saved to catalog
    const catalogRes = await adminAgent.get('/api/admin/catalog/leads?search=Test Bulk Cafe').expect(200);
    expect(catalogRes.body.data.leads.length).toBeGreaterThanOrEqual(1);

    // Verify action was logged
    const logsRes = await adminAgent.get('/api/admin/security/events').expect(200);
    const importLog = logsRes.body.data.events.find(e => e.action === 'ADMIN_BULK_IMPORT_COMMITTED');
    expect(importLog).toBeTruthy();
    expect(importLog.metadata.fileName.endsWith('.csv')).toBe(true);
  });

  it('admin catalog filters combine with AND correctly and do not leak across conditions', async () => {
    const adminAgent = request.agent(createApp());
    await adminAgent.post('/api/auth/login').send({ email, password }).expect(200);
    const adminCsrf = await getCsrfToken(adminAgent);

    // Create controlled test data: 4 leads with distinct properties
    const filterTag = `filter-test-${unique}`;

    // Lead A: Amman, has phone, no website, has instagram, category Cafe
    await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: `Lead A ${filterTag}`,
        category: 'Cafe',
        country: 'Jordan',
        governorate: 'Amman',
        phone: '+962791111111',
        sourceType: 'MANUAL_ADMIN',
      }).expect(201);

    // Lead B: Amman, no phone, no website, no instagram, category Cafe
    await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: `Lead B ${filterTag}`,
        category: 'Cafe',
        country: 'Jordan',
        governorate: 'Amman',
        sourceType: 'MANUAL_ADMIN',
      }).expect(201);

    // Lead C: Aqaba, has phone, no website, category Restaurant
    await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: `Lead C ${filterTag}`,
        category: 'Restaurant',
        country: 'Jordan',
        governorate: 'Aqaba',
        phone: '+962793333333',
        sourceType: 'MANUAL_ADMIN',
      }).expect(201);

    // Lead D: Irbid, has phone, has website, category Tech
    await adminAgent.post('/api/admin/catalog/leads')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        businessName: `Lead D ${filterTag}`,
        category: 'Tech',
        country: 'Jordan',
        governorate: 'Irbid',
        phone: '+962794444444',
        websiteUrl: 'https://example-d.test',
        instagramUrl: 'https://instagram.com/lead_d',
        sourceType: 'MANUAL_ADMIN',
      }).expect(201);

    // --- Test 1: governorate=Amman AND hasPhone=true → only Lead A ---
    const t1 = await adminAgent.get(`/api/admin/catalog/leads?governorate=Amman&hasPhone=true&search=${filterTag}`).expect(200);
    const t1Names = t1.body.data.leads.map((l) => l.businessName);
    expect(t1Names).toContain(`Lead A ${filterTag}`);
    expect(t1Names).not.toContain(`Lead B ${filterTag}`);
    expect(t1Names).not.toContain(`Lead C ${filterTag}`);
    expect(t1Names).not.toContain(`Lead D ${filterTag}`);

    // --- Test 2: governorate=Amman AND missingWebsite=true → Lead A and Lead B ---
    const t2 = await adminAgent.get(`/api/admin/catalog/leads?governorate=Amman&missingWebsite=true&search=${filterTag}`).expect(200);
    const t2Names = t2.body.data.leads.map((l) => l.businessName);
    expect(t2Names).toContain(`Lead A ${filterTag}`);
    expect(t2Names).toContain(`Lead B ${filterTag}`);
    expect(t2Names).not.toContain(`Lead C ${filterTag}`);
    expect(t2Names).not.toContain(`Lead D ${filterTag}`);

    // --- Test 3: source + category + governorate all AND ---
    const t3 = await adminAgent.get(`/api/admin/catalog/leads?source=MANUAL_ADMIN&category=Cafe&governorate=Amman&search=${filterTag}`).expect(200);
    const t3Names = t3.body.data.leads.map((l) => l.businessName);
    expect(t3Names).toContain(`Lead A ${filterTag}`);
    expect(t3Names).toContain(`Lead B ${filterTag}`);
    expect(t3Names).not.toContain(`Lead C ${filterTag}`);
    expect(t3Names).not.toContain(`Lead D ${filterTag}`);

    // --- Test 4: hasInstagram=true → only Lead D among our set ---
    const t4 = await adminAgent.get(`/api/admin/catalog/leads?hasInstagram=true&search=${filterTag}`).expect(200);
    const t4Names = t4.body.data.leads.map((l) => l.businessName);
    expect(t4Names).toContain(`Lead D ${filterTag}`);
    expect(t4Names).not.toContain(`Lead A ${filterTag}`);
    expect(t4Names).not.toContain(`Lead B ${filterTag}`);
    expect(t4Names).not.toContain(`Lead C ${filterTag}`);

    // --- Test 5: hasPhone=false → only Lead B among our set ---
    const t5 = await adminAgent.get(`/api/admin/catalog/leads?hasPhone=false&search=${filterTag}`).expect(200);
    const t5Names = t5.body.data.leads.map((l) => l.businessName);
    expect(t5Names).toContain(`Lead B ${filterTag}`);
    expect(t5Names).not.toContain(`Lead A ${filterTag}`);
    expect(t5Names).not.toContain(`Lead C ${filterTag}`);
    expect(t5Names).not.toContain(`Lead D ${filterTag}`);

    // --- Test 6: search does not override other filters ---
    const t6 = await adminAgent.get(`/api/admin/catalog/leads?search=${filterTag}&hasPhone=true&governorate=Aqaba`).expect(200);
    const t6Names = t6.body.data.leads.map((l) => l.businessName);
    expect(t6Names).toContain(`Lead C ${filterTag}`);
    expect(t6Names).not.toContain(`Lead A ${filterTag}`);

    // --- Test 7: response does not contain secrets ---
    expect(JSON.stringify(t1.body)).not.toContain('passwordHash');
    expect(JSON.stringify(t1.body)).not.toContain('SESSION_SECRET');

    // --- Test 8: normal user denied ---
    const normalEmail2 = `test.${unique}.filter-denied@findly.local`;
    const { agent: normalAgent2 } = await registerAccount({ userEmail: normalEmail2, name: 'FilterDenied' });
    const normalToken2 = verificationTokenFor(normalEmail2);
    await request(createApp()).post('/api/auth/verify-email').send({ token: normalToken2 }).expect(200);
    await normalAgent2.post('/api/auth/login').send({ email: normalEmail2, password }).expect(200);
    await normalAgent2.get('/api/admin/catalog/leads').expect(403);
  });
});
