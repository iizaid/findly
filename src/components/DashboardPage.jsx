import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import DashboardLayout from './dashboard/DashboardLayout';
import DashboardHome from './dashboard/pages/DashboardHome';
import DashboardFindLeadsPage from './dashboard/pages/DashboardFindLeadsPage';
import DashboardLeadListsPage from './dashboard/pages/DashboardLeadListsPage';
import DashboardMapPage from './dashboard/pages/DashboardMapPage';
import DashboardAnalysisPage from './dashboard/pages/DashboardAnalysisPage';
import DashboardCreditsPage from './dashboard/pages/DashboardCreditsPage';
import DashboardSettingsPage from './dashboard/pages/DashboardSettingsPage';
import DashboardAdminPage from './dashboard/pages/DashboardAdminPage';

const normalizeDashboardPath = (pathname) => {
  if (pathname === '/dashboard') return '/dashboard';
  if (pathname.startsWith('/dashboard/find-leads')) return '/dashboard/find-leads';
  if (pathname.startsWith('/dashboard/lead-lists')) return '/dashboard/lead-lists';
  if (pathname.startsWith('/dashboard/map')) return '/dashboard/map';
  if (pathname.startsWith('/dashboard/analysis')) return '/dashboard/analysis';
  if (pathname.startsWith('/dashboard/analyze')) return '/dashboard/analysis';
  if (pathname.startsWith('/dashboard/leads')) return '/dashboard/lead-lists';
  if (pathname.startsWith('/dashboard/credits')) return '/dashboard/credits';
  if (pathname.startsWith('/dashboard/admin')) return '/dashboard/admin';
  if (pathname.startsWith('/dashboard/settings')) return '/dashboard/settings';
  return '/dashboard';
};

const DashboardPage = ({ routePath = '/dashboard', onNavigate, onAuthOpen, onSessionChange, onNotice }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [isResending, setIsResending] = useState(false);
  const activeRoute = useMemo(() => normalizeDashboardPath(routePath), [routePath]);

  const loadDashboard = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const response = await apiRequest('/api/dashboard');
      onSessionChange?.(response.data.user);
      setState({ status: 'ready', data: response.data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onAuthOpen('login');
        return;
      }

      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        const me = await apiRequest('/api/auth/me').catch(() => null);
        onSessionChange?.(me?.data?.user || null);
        setState({ status: 'unverified', data: me?.data, message: error.message });
        return;
      }

      setState({
        status: 'error',
        message: error instanceof ApiError ? error.message : 'Could not load the dashboard.',
      });
    }
  }, [onAuthOpen, onSessionChange]);

  // Silent refresh: updates data in background without showing loading screen
  const refreshDashboard = useCallback(async () => {
    try {
      const response = await apiRequest('/api/dashboard');
      onSessionChange?.(response.data.user);
      setState((prev) => ({ ...prev, data: response.data }));
    } catch {
      // Silent fail — user stays on current page
    }
  }, [onSessionChange]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } finally {
      onSessionChange?.(null);
      onNavigate('/');
    }
  };

  const resendVerification = async () => {
    setIsResending(true);
    try {
      await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setState((current) => ({ ...current, message: 'Verification email sent. Check your inbox.' }));
    } catch (error) {
      setState((current) => ({
        ...current,
        message: error instanceof ApiError ? error.message : 'Could not resend verification email.',
      }));
    } finally {
      setIsResending(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1ed] text-black">
        <div className="rounded-full border border-black/[0.08] bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] text-secondary shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          Loading Findly...
        </div>
      </main>
    );
  }

  if (state.status === 'unverified') {
    const user = state.data?.user;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1ed] px-5 py-10 text-black">
        <div className="w-full max-w-[680px] rounded-[34px] border border-black/[0.08] bg-white p-7 shadow-[0_30px_90px_rgba(0,0,0,0.08)] md:p-10">
          <img src="/findly-logo-dark.png" alt="Findly" className="h-11 w-auto" draggable={false} />
          <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-black">
            <Mail size={30} />
          </div>
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-secondary">Email verification required</p>
          <h1 className="mt-4 text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
            Verify your email to continue.
          </h1>
          <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-secondary">
            Dashboard access and Opportunity Credits unlock after verifying <span className="text-black">{user?.email || 'your email'}</span>.
          </p>
          {state.message && (
            <div className="mt-6 rounded-2xl bg-[#F7F8F6] px-4 py-3 text-sm font-bold text-black">{state.message}</div>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={resendVerification}
              disabled={isResending}
              className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-bold text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {isResending ? 'Sending...' : 'Resend verification email'}
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
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1ed] px-5 text-black">
        <div className="w-full max-w-[560px] rounded-[30px] border border-black/[0.08] bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,0.08)]">
          <h1 className="text-4xl font-bold tracking-tighter">Dashboard unavailable.</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-secondary">{state.message}</p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={16} />
            Back to site
          </button>
        </div>
      </main>
    );
  }

  const { user, workspace, credits } = state.data;

  const pages = {
    '/dashboard': <DashboardHome user={user} workspace={workspace} credits={credits} onNavigate={onNavigate} />,
    '/dashboard/find-leads': <DashboardFindLeadsPage workspace={workspace} onNavigate={onNavigate} onNotice={onNotice} onUpdate={refreshDashboard} />,
    '/dashboard/lead-lists': <DashboardLeadListsPage onNavigate={onNavigate} onUpdate={refreshDashboard} />,
    '/dashboard/map': <DashboardMapPage onNavigate={onNavigate} />,
    '/dashboard/analysis': <DashboardAnalysisPage onNavigate={onNavigate} onNotice={onNotice} onUpdate={refreshDashboard} />,
    '/dashboard/credits': <DashboardCreditsPage credits={credits} onUpdate={refreshDashboard} />,
    '/dashboard/admin': <DashboardAdminPage user={user} onNavigate={onNavigate} />,
    '/dashboard/settings': (
      <DashboardSettingsPage
        user={user}
        workspace={workspace}
        credits={credits}
        onLogout={logout}
        onUpdate={refreshDashboard}
        onNavigate={onNavigate}
        onNotice={onNotice}
      />
    ),
  };

  return (
    <DashboardLayout
      user={user}
      workspace={workspace}
      credits={credits}
      routePath={activeRoute}
      onNavigate={onNavigate}
      onLogout={logout}
    >
      {pages[activeRoute]}
    </DashboardLayout>
  );
};

export default DashboardPage;
