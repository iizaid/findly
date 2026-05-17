import { useMemo, useState } from 'react';
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
  User,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

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
  const [touched, setTouched] = useState({});
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
  });

  const isSignup = mode === 'signup';
  const passwordScore = getPasswordScore(form.password);

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
        body: JSON.stringify({ email }),
      });
      setAccountEmail(email);
      setStatus({ type: 'success', message: 'If an account exists, a reset email has been sent.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Could not request a password reset. Please try again.',
      });
    } finally {
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
      const response = await apiRequest(isSignup ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(
          isSignup
            ? {
                name: normalizeName(form.name),
                email,
                password: form.password,
                companyWebsite: form.companyWebsite,
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
      const message = error instanceof ApiError
        ? error.message
        : 'Could not reach the secure auth server. Please try again.';
      setStatus({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
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
              Use Findly to review public signals, qualify business opportunities, and prepare better outreach before sending the first message.
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
