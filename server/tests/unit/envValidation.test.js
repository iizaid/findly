import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const strongSecret = 'test-session-secret-that-is-long-enough-for-findly';
const strongMasterKey = Buffer.from('a'.repeat(32)).toString('base64');
const strongTwoFactorKey = Buffer.from('b'.repeat(32)).toString('base64');

const productionEnv = {
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/findly',
  NODE_ENV: 'production',
  CLIENT_ORIGIN: 'https://app.findly.example',
  CLIENT_URL: 'https://app.findly.example',
  APP_URL: 'https://api.findly.example',
  SESSION_SECRET: strongSecret,
  COOKIE_SECURE: 'true',
  CSRF_COOKIE_SECURE: 'true',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'mailer@example.com',
  SMTP_PASS: 'smtp-password-value',
  EMAIL_FROM: 'Findly <mailer@example.com>',
  TWO_FACTOR_SECRET_ENCRYPTION_KEY: strongTwoFactorKey,
};

describe('production env validation', () => {
  it('allows development/test localhost defaults', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly_test',
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: strongSecret,
    });

    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.CLIENT_ORIGINS).toEqual(['http://localhost:5173']);
    expect(parsed.WEBSITE_FETCH_TIMEOUT_MS).toBe(5000);
    expect(parsed.WEBSITE_FETCH_MAX_BYTES).toBe(512000);
    expect(parsed.WEBSITE_FETCH_MAX_REDIRECTS).toBe(3);
    expect(parsed.WEBSITE_ENRICHMENT_TTL_DAYS).toBe(30);
  });

  it('rejects localhost client origins in production', () => {
    expect(() => parseEnv({
      ...productionEnv,
      CLIENT_ORIGIN: 'https://app.findly.example,http://localhost:5173',
    })).toThrow(/CLIENT_ORIGIN cannot point to localhost in production/);
  });

  it('rejects wildcard CORS origins in production', () => {
    expect(() => parseEnv({
      ...productionEnv,
      CLIENT_ORIGIN: '*',
    })).toThrow(/CLIENT_ORIGIN must be explicit/);
  });

  it('rejects insecure production cookie settings', () => {
    expect(() => parseEnv({
      ...productionEnv,
      COOKIE_SECURE: 'false',
    })).toThrow(/COOKIE_SECURE cannot be false in production/);
  });

  it('requires a strong AI secrets master key when dashboard secret management is enabled', () => {
    expect(() => parseEnv({
      ...productionEnv,
      AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED: 'true',
    })).toThrow(/AI_SECRETS_MASTER_KEY is required/);

    expect(() => parseEnv({
      ...productionEnv,
      AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED: 'true',
      AI_SECRETS_MASTER_KEY: 'short',
    })).toThrow(/AI_SECRETS_MASTER_KEY must decode to at least 32 bytes/);

    const parsed = parseEnv({
      ...productionEnv,
      AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED: 'true',
      AI_SECRETS_MASTER_KEY: strongMasterKey,
    });

    expect(parsed.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED).toBe(true);
  });

  it('parses disposable email domain lists and auth abuse defaults in test mode', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly_test',
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: strongSecret,
      DISPOSABLE_EMAIL_DOMAINS: 'mailinator.com,tempmail.com',
    });

    expect(parsed.AUTH_ABUSE_PROTECTION_ENABLED).toBe(true);
    expect(parsed.DISPOSABLE_EMAIL_DOMAINS_LIST).toEqual(['mailinator.com', 'tempmail.com']);
  });

  it('rejects unsafe test database urls unless explicitly overridden', () => {
    expect(() => parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: strongSecret,
    })).toThrow(/Refusing to run tests against a non-test database/);

    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: strongSecret,
      TEST_DATABASE_ALLOW_DEV_OVERWRITE: 'true',
    });

    expect(parsed.TEST_DATABASE_ALLOW_DEV_OVERWRITE).toBe(true);
  });

  it('prefers TEST_DATABASE_URL in test mode', () => {
    const parsed = parseEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
      TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly_test',
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: strongSecret,
    });

    expect(parsed.DATABASE_URL).toContain('findly_test');
  });

  it('requires turnstile keys when bot challenge protection is enabled in production', () => {
    expect(() => parseEnv({
      ...productionEnv,
      BOT_CHALLENGE_ENABLED: 'true',
    })).toThrow(/TURNSTILE_SECRET_KEY is required/);

    const parsed = parseEnv({
      ...productionEnv,
      BOT_CHALLENGE_ENABLED: 'true',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      TURNSTILE_SITE_KEY: 'turnstile-site',
    });

    expect(parsed.BOT_CHALLENGE_ENABLED).toBe(true);
    expect(parsed.TURNSTILE_SITE_KEY).toBe('turnstile-site');
  });
});
