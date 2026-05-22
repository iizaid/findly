import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  User,
} from 'lucide-react';

// ── Official brand SVG icons (inline, no extra dependencies) ──
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);
import {
  apiRequest,
  ApiError,
  cancelTwoFactorLogin,
  getOAuthStartUrl,
  verifyTwoFactorLogin,
} from '../lib/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ATTEMPT_KEY = 'findly_auth_attempts';
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'findly123',
]);

const getStoredJson = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (email) => email.trim().toLowerCase();
const normalizeTwoFactorCode = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();
const stripUnsafeChars = (value) => [...value]
  .filter((char) => {
    const code = char.charCodeAt(0);
    return code > 31 && code !== 127;
  })
  .join('')
  .replace(/[<>]/g, '');
const normalizeName = (value) => stripUnsafeChars(value).replace(/\s+/g, ' ').trim();

const getPasswordScore = (password) => {
  let score = 0;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
};

const toDisplayText = (value, maxLength) => stripUnsafeChars(value).replace(/\s{2,}/g, ' ').slice(0, maxLength);

const OAUTH_ERROR_MESSAGES = {
  oauth_provider_unavailable: 'This sign-in provider is temporarily unavailable.',
  oauth_invalid_state: 'The sign-in session expired. Please try again.',
  oauth_email_unverified: 'This provider did not return a verified email address.',
  oauth_email_missing: 'This provider did not return an email address.',
  oauth_login_failed: 'Could not complete sign-in. Please try again.',
};

const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'github', label: 'GitHub', Icon: GitHubIcon },
  { id: 'discord', label: 'Discord', Icon: DiscordIcon },
];
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
const TURNSTILE_SCRIPT_ID = 'findly-turnstile-script';

const isTurnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
const loadTurnstileScript = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') {
    reject(new Error('Turnstile is not available.'));
    return;
  }

  if (window.turnstile?.render) {
    resolve(window.turnstile);
    return;
  }

  const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(window.turnstile), { once: true });
    existingScript.addEventListener('error', () => reject(new Error('Turnstile failed to load.')), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  script.onload = () => resolve(window.turnstile);
  script.onerror = () => reject(new Error('Turnstile failed to load.'));
  document.head.appendChild(script);
});

const canSubmitAttempt = () => {
  const now = Date.now();
  const attempts = getStoredJson(ATTEMPT_KEY, []).filter((time) => now - time < 60_000);
  return { allowed: attempts.length < 5, attempts, retryAfter: Math.ceil((60_000 - (now - attempts[0])) / 1000) };
};

const recordAttempt = () => {
  const now = Date.now();
  const attempts = getStoredJson(ATTEMPT_KEY, []).filter((time) => now - time < 60_000);
  window.localStorage.setItem(ATTEMPT_KEY, JSON.stringify([...attempts, now]));
};

const AuthPage = ({ initialMode = 'signup', planContext, onClose, onNavigate, onSessionChange }) => {
  const [mode, setMode] = useState(initialMode);
  const [screen, setScreen] = useState('form');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerifyingTwoFactor, setIsVerifyingTwoFactor] = useState(false);
  const [touched, setTouched] = useState({});
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState({ token: '', expiresAt: '', returnTo: '/dashboard' });
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Freelancer',
    company: '',
    remember: true,
    terms: false,
    companyWebsite: '',
    botChallengeToken: '',
  });

  const isSignup = mode === 'signup';
  const passwordScore = getPasswordScore(form.password);
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const shouldRenderTurnstile = isTurnstileEnabled && (isSignup || screen === 'forgot-password');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    const twoFactorRequired = params.get('twoFactorRequired');
    const expiresAt = params.get('expiresAt');
    const returnTo = params.get('returnTo') || '/dashboard';

    if (twoFactorRequired === '1') {
      setMode('login');
      setScreen('two-factor');
      setTwoFactorChallenge({ token: '', expiresAt: expiresAt || '', returnTo });
      setStatus(null);
    }

    if (authError && OAUTH_ERROR_MESSAGES[authError]) {
      setStatus({ type: 'error', message: OAUTH_ERROR_MESSAGES[authError] });
    }

    if (authError || twoFactorRequired === '1') {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  useEffect(() => {
    setFormStartedAt(Date.now());
  }, [mode, screen]);

  useEffect(() => {
    if (!shouldRenderTurnstile) {
      setTurnstileReady(false);
      setForm((current) => current.botChallengeToken ? { ...current, botChallengeToken: '' } : current);
      if (turnstileWidgetIdRef.current !== null && window.turnstile?.remove) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstileContainerRef.current || !turnstile?.render || turnstileWidgetIdRef.current !== null) {
          return;
        }

        turnstileWidgetIdRef.current = turnstile.render(turnstileContainerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          size: 'flexible',
          callback: (token) => {
            setForm((current) => ({ ...current, botChallengeToken: token || '' }));
          },
          'expired-callback': () => {
            setForm((current) => ({ ...current, botChallengeToken: '' }));
          },
          'error-callback': () => {
            setForm((current) => ({ ...current, botChallengeToken: '' }));
          },
        });
        setTurnstileReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTurnstileReady(false);
          setForm((current) => ({ ...current, botChallengeToken: '' }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldRenderTurnstile]);

  const resetTurnstile = () => {
    if (turnstileWidgetIdRef.current !== null && window.turnstile?.reset) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
    setForm((current) => current.botChallengeToken ? { ...current, botChallengeToken: '' } : current);
  };

  const errors = useMemo(() => {
    const next = {};
    const email = normalizeEmail(form.email);
    const cleanDisplayName = normalizeName(form.name);
    const password = form.password.toLowerCase();
    const emailLocalPart = email.split('@')[0]?.toLowerCase();
    const nameParts = cleanDisplayName.toLowerCase().split(/\s+/).filter((part) => part.length >= 3);

    if (isSignup && cleanDisplayName.length < 2) {
      next.name = 'Enter your real name.';
    }

    if (!EMAIL_PATTERN.test(email)) {
      next.email = 'Use a valid business email.';
    }

    if (form.password.length < 10) {
      next.password = 'Password must be at least 10 characters.';
    } else if (isSignup && passwordScore < 5) {
      next.password = 'Use uppercase, lowercase, numbers, and a symbol.';
    } else if (isSignup && COMMON_PASSWORDS.has(password)) {
      next.password = 'Choose a less common password.';
    } else if (isSignup && emailLocalPart && password.includes(emailLocalPart)) {
      next.password = 'Password must not contain your email.';
    } else if (isSignup && nameParts.some((part) => password.includes(part))) {
      next.password = 'Password must not contain your name.';
    }

    if (isSignup && form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }

    if (isSignup && form.companyWebsite.trim()) {
      next.companyWebsite = 'Submission blocked.';
    }

    if (isSignup && !form.terms) {
      next.terms = 'You must agree before creating an account.';
    }

    return next;
  }, [form, isSignup, passwordScore]);

  const updateField = (field, value) => {
    setStatus(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const markTouched = (field) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const normalizeFieldOnBlur = (field) => {
    markTouched(field);
    if (field === 'name' || field === 'company') {
      updateField(field, normalizeName(form[field]));
    }
  };

  const showError = (field) => (submitted || touched[field]) && errors[field];

  const switchMode = (value) => {
    setMode(value);
    setScreen('form');
    setStatus(null);
    setSubmitted(false);
    setTouched({});
    setTwoFactorCode('');
    setTwoFactorChallenge({ token: '', expiresAt: '', returnTo: '/dashboard' });
  };

  const handleCancelTwoFactor = async () => {
    const challengeToken = twoFactorChallenge.token;
    setStatus(null);

    try {
      await cancelTwoFactorLogin(challengeToken || undefined);
    } catch {
      // The local flow should still reset even if the challenge already expired.
    }

    setTwoFactorCode('');
    setTwoFactorChallenge({ token: '', expiresAt: '', returnTo: '/dashboard' });
    setScreen('form');
  };

  const handleVerifyTwoFactor = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (normalizeTwoFactorCode(twoFactorCode).length < 6) {
      setStatus({ type: 'error', message: 'Enter your authenticator code or backup code.' });
      return;
    }

    setIsVerifyingTwoFactor(true);

    try {
      const response = await verifyTwoFactorLogin({
        challengeToken: twoFactorChallenge.token || undefined,
        code: normalizeTwoFactorCode(twoFactorCode),
      });

      onSessionChange?.(response.data?.user || null);
      onNavigate?.(response.data?.returnTo || twoFactorChallenge.returnTo || '/dashboard');
    } catch (error) {
      let message = 'Invalid authentication code.';
      if (error instanceof ApiError) {
        if (error.code === 'TWO_FACTOR_CHALLENGE_INVALID') {
          message = 'Invalid or expired two-factor challenge.';
        } else if (error.status === 429) {
          message = 'Too many attempts, please login again.';
        } else {
          message = error.message;
        }
      }
      setStatus({ type: 'error', message });
    } finally {
      setIsVerifyingTwoFactor(false);
    }
  };

  const sendPasswordReset = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setStatus(null);

    const email = normalizeEmail(form.email);
    if (!EMAIL_PATTERN.test(email)) {
      setStatus({ type: 'error', message: 'Use a valid email address first.' });
      return;
    }

    setIsSendingReset(true);
    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, botChallengeToken: form.botChallengeToken || undefined }),
      });
      setAccountEmail(email);
      setStatus({ type: 'success', message: 'If an account exists, a reset email has been sent.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Could not request a password reset. Please try again.',
      });
    } finally {
      resetTurnstile();
      setIsSendingReset(false);
    }
  };

  const resendVerification = async () => {
    setStatus(null);
    setIsResending(true);

    try {
      await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatus({ type: 'success', message: 'Verification email sent. Check your inbox.' });
    } catch (error) {
      let message = 'Could not send a verification email. Please try again.';
      if (error instanceof ApiError) {
        if (error.status === 401) {
          message = 'Your account was created, but this browser did not keep the secure session. Please log in, then resend the verification email.';
        } else if (error.code === 'BOT_CHALLENGE_REQUIRED' || error.code === 'BOT_CHALLENGE_FAILED') {
          message = 'We could not verify this request. Please refresh and try again.';
        } else {
          message = error.message;
        }
      }
      setStatus({ type: 'error', message });
    } finally {
      setIsResending(false);
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      // The user is leaving the auth flow either way.
    } finally {
      onSessionChange?.(null);
      onClose?.();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setStatus(null);

    const rate = canSubmitAttempt();
    if (!rate.allowed) {
      setStatus({ type: 'error', message: `Too many attempts. Try again in ${rate.retryAfter}s.` });
      return;
    }

    if (form.companyWebsite.trim()) {
      setStatus({ type: 'error', message: 'Submission blocked.' });
      recordAttempt();
      return;
    }

    if (Object.keys(errors).length > 0) {
      setStatus({ type: 'error', message: 'Fix the highlighted fields first.' });
      recordAttempt();
      return;
    }

    const email = normalizeEmail(form.email);

    setIsSubmitting(true);

    try {
      const formDurationMs = Math.max(0, Date.now() - formStartedAt);
      const response = await apiRequest(isSignup ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(
          isSignup
            ? {
                name: normalizeName(form.name),
                email,
                password: form.password,
                companyWebsite: form.companyWebsite,
                formDurationMs,
                botChallengeToken: form.botChallengeToken || undefined,
              }
            : {
                email,
                password: form.password,
                remember: form.remember,
              },
        ),
      });

      recordAttempt();

      if (isSignup) {
        setAccountEmail(email);
        setScreen('check-email');
        if (response.data && response.data.emailSent === false) {
          setStatus({ type: 'error', message: 'Account created, but the verification email could not be sent. Try resend.' });
        } else {
          setStatus(null);
        }
        return;
      }

      if (response.data?.requiresTwoFactor) {
        setMode('login');
        setScreen('two-factor');
        setAccountEmail(email);
        setTwoFactorCode('');
        setTwoFactorChallenge({
          token: response.data.challengeToken,
          expiresAt: response.data.expiresAt,
          returnTo: '/dashboard',
        });
        setStatus(null);
        return;
      }

      if (response.data?.user?.emailVerified) {
        onSessionChange?.(response.data.user);
        onNavigate?.('/dashboard');
        return;
      }

      onSessionChange?.(response.data?.user || null);
      setAccountEmail(response.data?.user?.email || email);
      setScreen('verification-required');
      setStatus({
        type: 'success',
        message: 'Login successful. Verify your email before entering the dashboard.',
      });
    } catch (error) {
      recordAttempt();
      let message = 'Could not reach the secure auth server. Please try again.';
      if (error instanceof ApiError) {
        if (error.status === 429) {
          if (error.retryAfterSeconds) {
            message = `Too many attempts. Please wait ${error.retryAfterSeconds}s and try again.`;
          } else if (error.limitName === 'login') {
            message = 'Too many login attempts. Please wait before trying again.';
          } else if (error.limitName === 'signup') {
            message = 'Too many signup attempts. Please wait before trying again.';
          } else {
            message = 'Too many requests. Please wait a moment.';
          }
        } else if (error.code === 'BOT_CHALLENGE_REQUIRED' || error.code === 'BOT_CHALLENGE_FAILED') {
          message = 'We could not verify this request. Please refresh and try again.';
        } else {
          message = error.message;
        }
      }
      setStatus({ type: 'error', message });
    } finally {
      resetTurnstile();
      setIsSubmitting(false);
    }
  };

  const startOAuth = (provider) => {
    setStatus(null);
    window.location.assign(getOAuthStartUrl(provider, '/dashboard'));
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden border-r border-black/[0.08] bg-black px-12 py-12 text-white lg:flex lg:min-h-screen lg:flex-col">
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={16} />
            Back to site
          </button>

          <div className="relative z-10 flex flex-1 flex-col justify-center pb-12">
            <img
              src="/findly-logo-auth.png"
              alt="Findly"
              className="h-28 w-auto object-contain object-left xl:h-32"
              draggable={false}
            />
            <h1 className="mt-14 max-w-3xl text-7xl font-bold leading-[1.01] tracking-tighter xl:text-8xl">
              Build a cleaner client pipeline.
            </h1>
            <p className="mt-8 max-w-2xl text-xl font-semibold leading-10 text-white/58">
                  Use Findly to review public business data, qualify business opportunities, and prepare better outreach before sending the first message.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 md:px-10">
          <div className="w-full max-w-[760px]">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 text-sm font-bold text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <img src="/findly-logo-dark.png" alt="Findly" className="h-10 w-auto" draggable={false} />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[34px] border border-black/[0.08] bg-white p-6 shadow-[0_28px_90px_rgba(0,0,0,0.08)] md:p-9"
            >
              <div className="mb-8 flex rounded-full border border-black/[0.08] bg-[#F7F8F6] p-1">
                {[
                  ['login', 'Log in'],
                  ['signup', 'Create account'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => switchMode(value)}
                    className={`relative flex-1 rounded-full px-4 py-3 text-sm font-bold transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      mode === value ? 'text-black' : 'text-secondary hover:text-black'
                    }`}
                  >
                    {mode === value && (
                      <motion.span
                        layoutId="auth-mode"
                        className="absolute inset-0 rounded-full bg-accent"
                        transition={{ type: 'spring', stiffness: 430, damping: 34 }}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                ))}
              </div>

              {screen === 'check-email' ? (
                <div className="min-h-[650px] pt-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
                    <CheckCircle2 size={26} />
                  </div>
                  <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-secondary">Check your email</p>
                  <h2 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                    Verify your account to continue.
                  </h2>
                  <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-secondary">
                    We sent a secure verification link to <span className="text-black">{accountEmail}</span>. Your dashboard and free Opportunity Credits unlock after verification.
                  </p>
                  {status && (
                    <div className={`mt-6 rounded-2xl px-4 py-3 text-sm font-bold ${status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'}`}>
                      {status.message}
                    </div>
                  )}
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={resendVerification}
                      disabled={isResending}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <RefreshCw size={16} />
                      {isResending ? 'Sending...' : 'Resend verification email'}
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex h-12 items-center justify-center rounded-full border border-black/[0.08] px-6 text-sm font-bold text-black transition-colors hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Back to site
                    </button>
                  </div>
                </div>
              ) : screen === 'verification-required' ? (
                <div className="min-h-[650px] pt-10">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-secondary">Email verification required</p>
                  <h2 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                    Verify your email to continue.
                  </h2>
                  <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-secondary">
                    Your account is secure, but the dashboard stays locked until <span className="text-black">{accountEmail}</span> is verified.
                  </p>
                  {status && (
                    <div className={`mt-6 rounded-2xl px-4 py-3 text-sm font-bold ${status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'}`}>
                      {status.message}
                    </div>
                  )}
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={resendVerification}
                      disabled={isResending}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-bold text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <RefreshCw size={16} />
                      {isResending ? 'Sending...' : 'Send verification email'}
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex h-12 items-center justify-center rounded-full border border-black/[0.08] px-6 text-sm font-bold text-black transition-colors hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              ) : screen === 'forgot-password' ? (
                <div className="min-h-[650px] pt-10">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-secondary">Account recovery</p>
                  <h2 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                    Reset your password.
                  </h2>
                  <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-secondary">
                    Enter your account email. For security, Findly will show the same response whether an account exists or not.
                  </p>
                  <form className="mt-8 space-y-5" onSubmit={sendPasswordReset} noValidate>
                    <div>
                      <label className="mb-2 block text-sm font-bold text-black">Email</label>
                      <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                        <Mail size={18} className="text-secondary" />
                        <input
                          value={form.email}
                          onChange={(event) => updateField('email', event.target.value)}
                          maxLength={255}
                          required
                          type="email"
                          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                          placeholder="you@company.com"
                          autoComplete="email"
                          inputMode="email"
                        />
                      </div>
                    </div>
                    {isTurnstileEnabled && (
                      <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-4">
                        <div ref={turnstileContainerRef} />
                        {!turnstileReady && (
                          <p className="mt-3 text-xs font-bold text-secondary">
                            Security check will appear here when available.
                          </p>
                        )}
                      </div>
                    )}
                    {status && (
                      <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'}`}>
                        {status.message}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="submit"
                        disabled={isSendingReset}
                        className="inline-flex h-12 items-center justify-center rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black disabled:opacity-50"
                      >
                        {isSendingReset ? 'Sending...' : 'Send reset link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScreen('form');
                          setStatus(null);
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-full border border-black/[0.08] px-6 text-sm font-bold text-black transition-colors hover:bg-black/[0.04]"
                      >
                        Back to login
                      </button>
                    </div>
                  </form>
                </div>
              ) : screen === 'two-factor' ? (
                <div className="min-h-[650px] pt-10">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-secondary">Two-factor authentication</p>
                  <h2 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                    Confirm it is you.
                  </h2>
                  <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-secondary">
                    Enter the 6-digit code from your authenticator app, or use one of your backup codes.
                    {accountEmail ? <> This sign-in is for <span className="text-black">{accountEmail}</span>.</> : null}
                  </p>
                  <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                    <form className="space-y-5 rounded-[28px] border border-black/[0.08] bg-white p-5 shadow-sm md:p-6" onSubmit={handleVerifyTwoFactor} noValidate>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-black">Enter your verification code</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-secondary">
                            Use the current code from your authenticator app or one of your one-time backup codes.
                          </p>
                        </div>
                        {twoFactorChallenge.expiresAt ? (
                          <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-secondary">Challenge expires</p>
                            <p className="mt-1 text-sm font-bold text-black">{new Date(twoFactorChallenge.expiresAt).toLocaleTimeString()}</p>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">Authenticator or backup code</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                          <Shield size={18} className="text-secondary" />
                          <input
                            value={twoFactorCode}
                            onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase())}
                            maxLength={32}
                            required
                            className="w-full bg-transparent text-sm font-semibold uppercase tracking-[0.18em] outline-none placeholder:text-secondary/50"
                            placeholder="123456 or ABCD-EFGH"
                            autoComplete="one-time-code"
                            inputMode="text"
                          />
                        </div>
                      </div>
                      {status && (
                        <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'}`}>
                          {status.message}
                        </div>
                      )}
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="submit"
                          disabled={isVerifyingTwoFactor}
                          className="inline-flex h-12 items-center justify-center rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black disabled:opacity-50"
                        >
                          {isVerifyingTwoFactor ? 'Verifying...' : 'Verify code'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelTwoFactor}
                          className="inline-flex h-12 items-center justify-center rounded-full border border-black/[0.08] px-6 text-sm font-bold text-black transition-colors hover:bg-black/[0.04]"
                        >
                          Back to login
                        </button>
                      </div>
                    </form>
                    <div className="space-y-4 rounded-[28px] border border-black/[0.08] bg-[#FBFBFA] p-5 md:p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
                        <Shield size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-black">What you can use here</p>
                        <ul className="mt-3 space-y-2 text-xs font-semibold leading-5 text-secondary">
                          <li>6-digit authenticator code from Google Authenticator, Microsoft Authenticator, Authy, or 1Password.</li>
                          <li>One unused backup code if your phone is unavailable.</li>
                          <li>Use “Back to login” if the challenge expired or you started sign-in on the wrong account.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-secondary">
                      {isSignup ? 'Create your workspace' : 'Welcome back'}
                    </p>
                    <h2 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                      {isSignup ? 'Start finding better opportunities.' : 'Continue your lead research.'}
                    </h2>
                  </div>

                  <form className="mt-8 min-h-[650px] space-y-5" onSubmit={handleSubmit} noValidate>
                <div className="grid gap-3 sm:grid-cols-3">
                  {OAUTH_PROVIDERS.map((provider) => {
                    const ProviderIcon = provider.Icon;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => startOAuth(provider.id)}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-4 text-sm font-bold text-black transition-colors hover:bg-[#F7F8F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={`Continue with ${provider.label}`}
                      >
                        <ProviderIcon />
                        {provider.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-secondary">
                  <span className="h-px flex-1 bg-black/[0.08]" />
                  <span>{isSignup ? 'or create with email' : 'or log in with email'}</span>
                  <span className="h-px flex-1 bg-black/[0.08]" />
                </div>

                {isSignup && planContext && (
                  <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3 text-sm font-bold text-black">
                    Selected plan: {planContext}
                  </div>
                )}

                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.companyWebsite}
                  onChange={(event) => updateField('companyWebsite', event.target.value)}
                  className="hidden"
                  aria-hidden="true"
                />
                <input
                  type="hidden"
                  value={form.botChallengeToken}
                  readOnly
                  aria-hidden="true"
                />

                {shouldRenderTurnstile && (
                  <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-4">
                    <div ref={turnstileContainerRef} />
                    {!turnstileReady && (
                      <p className="mt-3 text-xs font-bold text-secondary">
                        Security check will appear here when available.
                      </p>
                    )}
                  </div>
                )}

                {isSignup && (
                  <div>
                    <label className="mb-2 block text-sm font-bold text-black">Full name</label>
                    <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                      <User size={18} className="text-secondary" />
                      <input
                        id="findly-full-name"
                        name="name"
                        value={form.name}
                        onChange={(event) => updateField('name', toDisplayText(event.target.value, 80))}
                        onBlur={() => normalizeFieldOnBlur('name')}
                        maxLength={80}
                        minLength={2}
                        required
                        aria-invalid={Boolean(showError('name'))}
                        aria-describedby={showError('name') ? 'findly-name-error' : undefined}
                        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </div>
                    {showError('name') && <p id="findly-name-error" className="mt-2 text-xs font-bold text-red-600">{errors.name}</p>}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-bold text-black">Email</label>
                  <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                    <Mail size={18} className="text-secondary" />
                    <input
                      id="findly-email"
                      name="email"
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      onBlur={() => markTouched('email')}
                      maxLength={255}
                      required
                      type="email"
                      aria-invalid={Boolean(showError('email'))}
                      aria-describedby={showError('email') ? 'findly-email-error' : undefined}
                      className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                      placeholder="you@company.com"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                  {showError('email') && <p id="findly-email-error" className="mt-2 text-xs font-bold text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-black">Password</label>
                  <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                    <Lock size={18} className="text-secondary" />
                    <input
                      id="findly-password"
                      name="password"
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      onBlur={() => markTouched('password')}
                      maxLength={128}
                      minLength={10}
                      required
                      type={showPassword ? 'text' : 'password'}
                      aria-invalid={Boolean(showError('password'))}
                      aria-describedby={showError('password') ? 'findly-password-error' : undefined}
                      className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                      placeholder="Minimum 10 characters"
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="rounded-full text-secondary transition-colors duration-200 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {showError('password') && <p id="findly-password-error" className="mt-2 text-xs font-bold text-red-600">{errors.password}</p>}
                  {isSignup && (
                    <div className="mt-3 grid grid-cols-5 gap-1">
                      {[0, 1, 2, 3, 4].map((step) => (
                        <div key={step} className={`h-1.5 rounded-full ${passwordScore > step ? 'bg-accent' : 'bg-black/[0.08]'}`} />
                      ))}
                    </div>
                  )}
                </div>

                {isSignup && (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-bold text-black">Confirm password</label>
                      <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                        <Lock size={18} className="text-secondary" />
                        <input
                          id="findly-confirm-password"
                          name="confirmPassword"
                          value={form.confirmPassword}
                          onChange={(event) => updateField('confirmPassword', event.target.value)}
                          onBlur={() => markTouched('confirmPassword')}
                          maxLength={128}
                          required
                          type={showPassword ? 'text' : 'password'}
                          aria-invalid={Boolean(showError('confirmPassword'))}
                          aria-describedby={showError('confirmPassword') ? 'findly-confirm-password-error' : undefined}
                          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                          placeholder="Repeat password"
                          autoComplete="new-password"
                        />
                      </div>
                      {showError('confirmPassword') && <p id="findly-confirm-password-error" className="mt-2 text-xs font-bold text-red-600">{errors.confirmPassword}</p>}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">Primary role</label>
                        <select
                          id="findly-role"
                          name="role"
                          value={form.role}
                          onChange={(event) => updateField('role', event.target.value)}
                          className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none"
                        >
                          <option>Freelancer</option>
                          <option>Agency</option>
                          <option>Web developer</option>
                          <option>Marketer</option>
                          <option>Automation specialist</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">Company</label>
                        <input
                          id="findly-company"
                          name="company"
                          value={form.company}
                          onChange={(event) => updateField('company', toDisplayText(event.target.value, 90))}
                          onBlur={() => normalizeFieldOnBlur('company')}
                          maxLength={90}
                          className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none placeholder:text-secondary/50"
                          placeholder="Optional"
                          autoComplete="organization"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {!isSignup && (
                    <label className="flex items-center gap-3 text-sm font-semibold text-secondary">
                      <input
                        type="checkbox"
                        name="remember"
                        checked={form.remember}
                        onChange={(event) => updateField('remember', event.target.checked)}
                        className="h-4 w-4 accent-black"
                      />
                      Remember this device
                    </label>
                  )}

                  {isSignup && (
                    <label className="flex items-start gap-3 text-sm font-semibold leading-6 text-secondary">
                      <input
                        type="checkbox"
                        name="terms"
                        checked={form.terms}
                        onChange={(event) => {
                          markTouched('terms');
                          updateField('terms', event.target.checked);
                        }}
                        className="mt-1 h-4 w-4 accent-black"
                      />
                      I agree to the Privacy Policy
                    </label>
                  )}

                  {!isSignup && (
                    <button
                      type="button"
                      onClick={() => {
                        setScreen('forgot-password');
                        setStatus(null);
                      }}
                      className="text-left text-sm font-bold text-black hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:text-right"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                {showError('terms') && <p className="text-xs font-bold text-red-600">{errors.terms}</p>}

                {status && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                      status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {status.message}
                  </div>
                )}

                <button
                  type="submit"
                  className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-all duration-300 hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Securing request...' : isSignup ? 'Create secure account' : 'Log in'}
                  <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                </button>
                  </form>
                </>
              )}


            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthPage;
