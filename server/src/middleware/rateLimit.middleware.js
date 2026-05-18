import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { errorCodes } from '../utils/AppError.js';

const auditCache = new Map();
const AUDIT_THROTTLE_MS = 60000; // 1 minute

const auditRateLimit = (req, limitName) => {
  const cacheKey = `${req.ip}:${req.originalUrl}:${limitName}`;
  const now = Date.now();
  const lastLogged = auditCache.get(cacheKey) || 0;

  if (now - lastLogged < AUDIT_THROTTLE_MS) return;
  auditCache.set(cacheKey, now);

  // Clean up cache periodically (very rough garbage collection)
  if (auditCache.size > 10000) auditCache.clear();

  prisma.auditLog.create({
    data: {
      action: 'RATE_LIMIT_TRIGGERED',
      entityType: 'RateLimit',
      metadata: {
        limitName,
        method: req.method,
        path: req.originalUrl,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  }).catch(() => {});
};

const makeRateLimit = ({ windowMs, limit, message, name, keyGenerator }) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      auditRateLimit(req, name);
      return res.status(429).json({
        success: false,
        error: {
          code: errorCodes.RATE_LIMITED,
          message,
        },
      });
    },
  });

export const generalRateLimiter = makeRateLimit({
  name: 'general',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  message: 'Too many requests. Please try again later.',
});

export const authRateLimiter = makeRateLimit({
  name: 'auth',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  message: 'Too many authentication attempts. Please try again later.',
});

export const signupRateLimiter = makeRateLimit({
  name: 'signup',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.SIGNUP_RATE_LIMIT_MAX,
  message: 'Too many signup attempts. Please try again later.',
});

export const loginRateLimiter = makeRateLimit({
  name: 'login',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  message: 'Too many login attempts. Please try again later.',
});

export const passwordResetRateLimiter = makeRateLimit({
  name: 'password-reset',
  windowMs: env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  limit: env.PASSWORD_RESET_RATE_LIMIT_MAX,
  message: 'Too many password reset attempts. Please try again later.',
});

export const searchRateLimiter = makeRateLimit({
  name: 'search',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.SEARCH_RATE_LIMIT_MAX,
  message: 'Too many search requests. Please try again later.',
});

export const analysisRateLimiter = makeRateLimit({
  name: 'analysis',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.ANALYSIS_RATE_LIMIT_MAX,
  message: 'Too many analysis requests. Please try again later.',
});

export const aiProviderTestRateLimiter = makeRateLimit({
  name: 'ai-provider-test',
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user?.id || 'guest',
  message: 'Too many AI provider tests. Please try again later.',
});

export const websiteEnrichmentRateLimiter = makeRateLimit({
  name: 'website-enrichment',
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user?.id || 'guest',
  message: 'Too many website enrichment requests. Please try again later.',
});
