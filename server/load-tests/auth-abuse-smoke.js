import { requireLoadEnv } from './helpers.js';

requireLoadEnv();

const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
const signupAttempts = Number(process.env.SIGNUP_ATTEMPTS || 8);
const loginAttempts = Number(process.env.LOGIN_ATTEMPTS || 12);
const resetAttempts = Number(process.env.RESET_ATTEMPTS || 6);
const password = process.env.SMOKE_PASSWORD || 'Secure12345@#$';
const timestamp = Date.now().toString(36);

const requestJson = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    const payload = await response.json();
    return {
      status: response.status,
      body: payload,
    };
  } catch {
    return {
      status: response.status,
      body: null,
    };
  }
};

const runSignupSequence = async () => {
  const results = [];
  for (let index = 0; index < signupAttempts; index += 1) {
    const email = `smoke.signup.${timestamp}.${index}@findly.local`;
    results.push(await requestJson('/api/auth/register', {
      name: 'Smoke Signup',
      email,
      password,
      formDurationMs: 5000,
      companyWebsite: '',
    }));
  }
  return results;
};

const runLoginSequence = async () => {
  const email = `smoke.login.${timestamp}@findly.local`;
  await requestJson('/api/auth/register', {
    name: 'Smoke Login',
    email,
    password,
    formDurationMs: 5000,
    companyWebsite: '',
  });

  const results = [];
  for (let index = 0; index < loginAttempts; index += 1) {
    results.push(await requestJson('/api/auth/login', {
      email,
      password: 'WrongPassword123!',
    }));
  }
  return results;
};

const runPasswordResetSequence = async () => {
  const email = `smoke.reset.${timestamp}@findly.local`;
  const results = [];
  for (let index = 0; index < resetAttempts; index += 1) {
    results.push(await requestJson('/api/auth/forgot-password', { email }));
  }
  return results;
};

const summarize = (name, items) => ({
  name,
  total: items.length,
  byStatus: items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {}),
  rateLimited: items.filter((item) => item.body?.error?.code === 'RATE_LIMITED').length,
});

const run = async () => {
  const [signup, login, reset] = await Promise.all([
    runSignupSequence(),
    runLoginSequence(),
    runPasswordResetSequence(),
  ]);

  const summary = [
    summarize('signup', signup),
    summarize('login', login),
    summarize('password-reset', reset),
  ];

  console.log(JSON.stringify({ test: 'auth-abuse-smoke', baseUrl, summary }, null, 2));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
