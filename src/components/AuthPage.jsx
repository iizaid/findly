import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from 'lucide-react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ATTEMPT_KEY = 'findly_auth_attempts';
const EMAILS_KEY = 'findly_registered_emails_demo';

const getStoredJson = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const getPasswordScore = (password) => {
  let score = 0;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
};

const cleanName = (value) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

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

const AuthPage = ({ initialMode = 'signup', planContext, onClose, onNotice }) => {
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [status, setStatus] = useState(null);
  const [submitted, setSubmitted] = useState(false);
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
    website: '',
  });

  const isSignup = mode === 'signup';
  const passwordScore = getPasswordScore(form.password);

  const errors = useMemo(() => {
    const next = {};
    const email = normalizeEmail(form.email);

    if (isSignup && cleanName(form.name).length < 2) {
      next.name = 'Enter your real name.';
    }

    if (!EMAIL_PATTERN.test(email)) {
      next.email = 'Use a valid business email.';
    }

    if (form.password.length < 10) {
      next.password = 'Password must be at least 10 characters.';
    } else if (isSignup && passwordScore < 4) {
      next.password = 'Use uppercase, lowercase, numbers, and a symbol.';
    }

    if (isSignup && form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
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

  const showError = (field) => (submitted || touched[field]) && errors[field];

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);

    const rate = canSubmitAttempt();
    if (!rate.allowed) {
      setStatus({ type: 'error', message: `Too many attempts. Try again in ${rate.retryAfter}s.` });
      return;
    }

    if (form.website.trim()) {
      setStatus({ type: 'error', message: 'Submission blocked.' });
      recordAttempt();
      return;
    }

    if (Date.now() - startedAt < 1800) {
      setStatus({ type: 'error', message: 'Please review the form before submitting.' });
      recordAttempt();
      return;
    }

    if (Object.keys(errors).length > 0) {
      setStatus({ type: 'error', message: 'Fix the highlighted fields first.' });
      recordAttempt();
      return;
    }

    const email = normalizeEmail(form.email);
    const registeredEmails = getStoredJson(EMAILS_KEY, []);

    if (isSignup && registeredEmails.includes(email)) {
      setStatus({ type: 'error', message: 'An account already exists for this email.' });
      recordAttempt();
      return;
    }

    if (isSignup) {
      window.localStorage.setItem(EMAILS_KEY, JSON.stringify([...registeredEmails, email]));
    }

    recordAttempt();
    setStatus({
      type: 'success',
      message: isSignup
        ? 'Account request validated. Connect this form to your backend auth provider next.'
        : 'Login form validated. Backend session verification should run next.',
    });
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
                    onClick={() => {
                      setMode(value);
                      setStatus(null);
                    }}
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
                  value={form.website}
                  onChange={(event) => updateField('website', event.target.value)}
                  className="hidden"
                  aria-hidden="true"
                />

                {isSignup && (
                  <div>
                    <label className="mb-2 block text-sm font-bold text-black">Full name</label>
                    <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                      <User size={18} className="text-secondary" />
                      <input
                        value={form.name}
                        onChange={(event) => updateField('name', cleanName(event.target.value))}
                        onBlur={() => markTouched('name')}
                        maxLength={80}
                        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </div>
                    {showError('name') && <p className="mt-2 text-xs font-bold text-red-600">{errors.name}</p>}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-bold text-black">Email</label>
                  <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                    <Mail size={18} className="text-secondary" />
                    <input
                      value={form.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      onBlur={() => markTouched('email')}
                      maxLength={120}
                      className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                      placeholder="you@company.com"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                  {showError('email') && <p className="mt-2 text-xs font-bold text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-black">Password</label>
                  <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                    <Lock size={18} className="text-secondary" />
                    <input
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      onBlur={() => markTouched('password')}
                      maxLength={128}
                      type={showPassword ? 'text' : 'password'}
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
                  {showError('password') && <p className="mt-2 text-xs font-bold text-red-600">{errors.password}</p>}
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
                          value={form.confirmPassword}
                          onChange={(event) => updateField('confirmPassword', event.target.value)}
                          onBlur={() => markTouched('confirmPassword')}
                          maxLength={128}
                          type={showPassword ? 'text' : 'password'}
                          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                          placeholder="Repeat password"
                          autoComplete="new-password"
                        />
                      </div>
                      {showError('confirmPassword') && <p className="mt-2 text-xs font-bold text-red-600">{errors.confirmPassword}</p>}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">Primary role</label>
                        <select
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
                        value={form.company}
                        onChange={(event) => updateField('company', cleanName(event.target.value))}
                        onBlur={() => markTouched('company')}
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
                      onClick={() => onNotice?.({
                        title: 'Password reset coming soon',
                        message: 'Password reset will be available after backend integration.',
                      })}
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
                >
                  {isSignup ? 'Create secure account' : 'Log in'}
                  <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                </button>
              </form>


            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthPage;
