import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const requestContext = (req) => ({
  ipAddress: req.ip || null,
  userAgent: req.get('user-agent') || null,
});

const shouldRequireChallenge = (mode, riskLevel = 'LOW') => {
  if (!env.BOT_CHALLENGE_ENABLED || mode === 'off') return false;
  if (mode === 'required') return true;
  return riskLevel === 'MEDIUM' || riskLevel === 'HIGH';
};

export const getBotChallengeClientConfig = () => ({
  enabled: env.BOT_CHALLENGE_ENABLED,
  provider: env.BOT_CHALLENGE_PROVIDER,
  siteKey: env.TURNSTILE_SITE_KEY || null,
  signupMode: env.BOT_CHALLENGE_SIGNUP_MODE,
  passwordResetMode: env.BOT_CHALLENGE_PASSWORD_RESET_MODE,
});

export const verifyBotChallengeToken = async ({ token, req, fetchImpl = fetch }) => {
  if (!env.BOT_CHALLENGE_ENABLED) return { success: true, provider: null };
  if (!token) {
    throw new AppError(errorCodes.BOT_CHALLENGE_REQUIRED, 'We could not verify this request. Please try again.', 403);
  }

  const context = requestContext(req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.BOT_CHALLENGE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: context.ipAddress || '',
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new AppError(errorCodes.BOT_CHALLENGE_FAILED, 'We could not verify this request. Please try again.', 403);
    }

    return { success: true, provider: env.BOT_CHALLENGE_PROVIDER };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(errorCodes.BOT_CHALLENGE_FAILED, 'We could not verify this request. Please try again.', 403);
  } finally {
    clearTimeout(timeout);
  }
};

export const enforceBotChallengeIfNeeded = async ({
  mode,
  token,
  req,
  riskLevel = 'LOW',
  fetchImpl = fetch,
}) => {
  if (!shouldRequireChallenge(mode, riskLevel)) {
    return { required: false, passed: false };
  }

  await verifyBotChallengeToken({ token, req, fetchImpl });
  return { required: true, passed: true };
};
