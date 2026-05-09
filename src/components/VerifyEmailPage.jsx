import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

const VerifyEmailPage = ({ token, onNavigate, onAuthOpen, onSessionChange }) => {
  const [state, setState] = useState({ status: 'verifying', message: 'Verifying your Findly account...' });

  useEffect(() => {
    let active = true;

    const verify = async () => {
      if (!token) {
        setState({ status: 'error', message: 'Verification token is missing.' });
        return;
      }

      try {
        const response = await apiRequest('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        if (!active) return;

        setState({
          status: 'success',
          message: response.message || 'Your email has been verified.',
          nextAction: response.data.nextAction,
        });

        if (active && onSessionChange && response.data.authenticated) {
          onSessionChange(response.data.user);
        } else if (active && onSessionChange) {
          onSessionChange(null);
        }
      } catch (error) {
        if (!active) return;
        
        // Handle "already verified" response properly
        if (error instanceof ApiError && error.status === 400 && error.message.includes('already verified')) {
          setState({
            status: 'success',
            message: 'Your email is already verified.',
            nextAction: 'LOGIN_REQUIRED', // default to login if it was an error response with no data
          });
          
          if (active && onSessionChange) {
            onSessionChange(null);
          }
          return;
        }

        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Could not verify this email link.',
        });
      }
    };

    verify();

    return () => {
      active = false;
    };
  }, [token, onSessionChange]);

  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-black">
      <div className="w-full max-w-[680px] rounded-[34px] border border-black/[0.08] bg-white p-7 shadow-[0_30px_90px_rgba(0,0,0,0.08)] md:p-10">
        <img src="/findly-logo-dark.png" alt="Findly" className="h-11 w-auto" draggable={false} />

        <div className={`mt-10 flex h-16 w-16 items-center justify-center rounded-3xl ${isError ? 'bg-red-50 text-red-600' : 'bg-accent text-black'}`}>
          {isError ? <XCircle size={30} /> : <CheckCircle2 size={30} />}
        </div>

        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-secondary">
          {state.status === 'verifying' ? 'Verifying account' : isSuccess ? 'Email verified' : 'Verification issue'}
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
          {state.status === 'verifying' ? 'Securing your workspace.' : isSuccess ? 'You can enter Findly now.' : 'This link cannot be used.'}
        </h1>
        <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-secondary">
          {state.message}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {isSuccess ? (
            state.nextAction === 'ENTER_DASHBOARD' ? (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Enter dashboard
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAuthOpen('login')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Log in
                <ArrowRight size={16} />
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => onAuthOpen('login')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Log in
              <ArrowRight size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.08] px-6 text-sm font-bold text-black transition-colors hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={16} />
            Back to site
          </button>
        </div>
      </div>
    </main>
  );
};

export default VerifyEmailPage;
