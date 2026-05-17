import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

const passwordChecks = [
  ['length', (value) => value.length >= 10, 'At least 10 characters'],
  ['lower', (value) => /[a-z]/.test(value), 'Lowercase letter'],
  ['upper', (value) => /[A-Z]/.test(value), 'Uppercase letter'],
  ['number', (value) => /\d/.test(value), 'Number'],
  ['symbol', (value) => /[^a-zA-Z0-9]/.test(value), 'Symbol'],
];

const ResetPasswordPage = ({ token, onNavigate, onAuthOpen }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [completed, setCompleted] = useState(false);

  const validation = useMemo(() => {
    const checks = passwordChecks.map(([key, check, label]) => ({ key, ok: check(newPassword), label }));
    return {
      checks,
      strong: checks.every((item) => item.ok),
      matches: newPassword && confirmPassword && newPassword === confirmPassword,
    };
  }, [newPassword, confirmPassword]);

  const canSubmit = token && validation.strong && validation.matches && !isSubmitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (!canSubmit) {
      setStatus({ type: 'error', message: 'Use a stronger matching password first.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setCompleted(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof ApiError ? error.message : 'Could not reset your password. Please request a new link.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-8 text-black">
      <div className="w-full max-w-xl rounded-[34px] border border-black/[0.08] bg-white p-6 shadow-[0_28px_90px_rgba(0,0,0,0.08)] md:p-9">
        <button
          type="button"
          onClick={() => onNavigate?.('/')}
          className="inline-flex items-center gap-2 text-sm font-bold text-secondary hover:text-black"
        >
          <ArrowLeft size={16} />
          Back to site
        </button>

        {completed ? (
          <div className="pt-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
              <CheckCircle2 size={26} />
            </div>
            <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-secondary">Password reset</p>
            <h1 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter">Log in with your new password.</h1>
            <p className="mt-5 text-sm font-semibold leading-7 text-secondary">
              Your old sessions have been signed out. Use your new password to continue.
            </p>
            <button
              type="button"
              onClick={() => onAuthOpen?.('login')}
              className="mt-8 h-12 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
            >
              Log in
            </button>
          </div>
        ) : (
          <>
            <div className="mt-10">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-secondary">Account recovery</p>
              <h1 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter">Choose a new password.</h1>
              <p className="mt-5 text-sm font-semibold leading-7 text-secondary">
                Use a strong password. This reset link can be used once.
              </p>
            </div>

            {!token && (
              <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                This reset link is missing a token. Request a new password reset email.
              </div>
            )}

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <div>
                <label className="mb-2 block text-sm font-bold text-black">New password</label>
                <div className="flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3">
                  <Lock size={18} className="text-secondary" />
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    maxLength={128}
                    minLength={10}
                    required
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-secondary/50"
                    placeholder="Minimum 10 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="rounded-full text-secondary transition-colors duration-200 hover:text-black"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {validation.checks.map((item) => (
                    <span key={item.key} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.ok ? 'bg-accent/25 text-black' : 'bg-black/[0.04] text-secondary'}`}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-black">Confirm password</label>
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  maxLength={128}
                  required
                  type={showPassword ? 'text' : 'password'}
                  className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none placeholder:text-secondary/50"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
                {confirmPassword && !validation.matches && (
                  <p className="mt-2 text-xs font-bold text-red-600">Passwords do not match.</p>
                )}
              </div>

              {status && (
                <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${status.type === 'success' ? 'bg-accent/25 text-black' : 'bg-red-50 text-red-700'}`}>
                  {status.message}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="h-14 w-full rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black disabled:opacity-50"
              >
                {isSubmitting ? 'Resetting password...' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
};

export default ResetPasswordPage;
