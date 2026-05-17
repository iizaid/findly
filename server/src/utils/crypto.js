import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

const TOKEN_BYTES = 32;

export const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

export const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);

export const createSessionToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

export const createEmailVerificationToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

export const createPasswordResetToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

export const hashSessionToken = (token) => {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(token)
    .digest('hex');
};

export const hashEmailVerificationToken = (token) => {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(`email-verification:${token}`)
    .digest('hex');
};

export const hashPasswordResetToken = (token) => {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(`password-reset:${token}`)
    .digest('hex');
};

export const hashAuditValue = (value) => {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(String(value))
    .digest('hex');
};

export const createCsrfToken = () => {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(`csrf:${raw}`)
    .digest('base64url');

  return `${raw}.${signature}`;
};

export const verifyCsrfToken = (token) => {
  if (typeof token !== 'string') return false;
  const [raw, signature] = token.split('.');
  if (!raw || !signature) return false;

  const expected = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(`csrf:${raw}`)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
};
