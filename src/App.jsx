import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import SearchSourcesStrip from './components/SearchSourcesStrip';
import ProductFilmSection from './components/ProductFilmSection';
import LoadingScreen from './components/LoadingScreen';
import OpportunityEngineSection from './components/OpportunityEngineSection';
import PricingSection from './components/PricingSection';
import Footer from './components/Footer';
import NoticeModal from './components/NoticeModal';
import { apiRequest, ApiError } from './lib/api';

const AuthPage = lazy(() => import('./components/AuthPage'));
const DashboardPage = lazy(() => import('./components/DashboardPage'));
const VerifyEmailPage = lazy(() => import('./components/VerifyEmailPage'));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
    <div>
      <div className="mx-auto h-3 w-16 rounded-full bg-accent" />
      <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-secondary">Loading Findly</p>
    </div>
  </div>
);

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState(null);
  const [notice, setNotice] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [route, setRoute] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));

  const navigate = useCallback((path) => {
    window.history.pushState({}, '', path);
    setRoute({
      pathname: window.location.pathname,
      search: window.location.search,
    });
    setAuthState(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openAuth = useCallback((mode = 'signup', plan = null) => {
    setNotice(null);
    setAuthState({ mode, plan });
  }, []);

  const openNotice = useCallback((nextNotice) => {
    setNotice(nextNotice);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch {
      // Clearing local UI state is still correct if the server session is already gone.
    } finally {
      setCurrentUser(null);
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    const onPopState = () => {
      setRoute({
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await apiRequest('/api/auth/me');
        if (active) setCurrentUser(response.data.user);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && active) {
          setCurrentUser(null);
          return;
        }

        if (active) setCurrentUser(null);
      }
    };

    loadSession();

    return () => {
      active = false;
    };
  }, [route.pathname]);

  useEffect(() => {
    if (isLoading || !window.location.hash) return;

    const target = window.location.hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
    }, 80);

    return () => clearTimeout(timer);
  }, [isLoading]);

  if (route.pathname.startsWith('/dashboard') && !authState) {
    return (
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <DashboardPage
            routePath={route.pathname}
            onNavigate={navigate}
            onAuthOpen={openAuth}
            onSessionChange={setCurrentUser}
            onNotice={openNotice}
          />
        </Suspense>
        <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      </MotionConfig>
    );
  }

  if (authState) {
    return (
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <AuthPage
            initialMode={authState.mode}
            planContext={authState.plan}
            onClose={() => setAuthState(null)}
            onNotice={openNotice}
            onNavigate={navigate}
            onSessionChange={setCurrentUser}
          />
        </Suspense>
        <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      </MotionConfig>
    );
  }

  if (route.pathname === '/verify-email') {
    const token = new URLSearchParams(route.search).get('token') || '';

    return (
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <VerifyEmailPage
            token={token}
            currentUser={currentUser}
            onNavigate={navigate}
            onAuthOpen={openAuth}
            onSessionChange={setCurrentUser}
          />
        </Suspense>
        <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      {isLoading && (
        <LoadingScreen onComplete={() => setIsLoading(false)} />
      )}
      <div className="min-h-screen flex flex-col bg-white text-primary relative">
        <Navbar
          ready={!isLoading}
          currentUser={currentUser}
          onAuthOpen={openAuth}
          onNavigate={navigate}
          onLogout={logout}
        />
        <Hero ready={!isLoading} currentUser={currentUser} onAuthOpen={openAuth} onNavigate={navigate} />
        <SearchSourcesStrip />
        <ProductFilmSection />
        <OpportunityEngineSection onNotice={openNotice} />
        <PricingSection onAuthOpen={openAuth} currentUser={currentUser} onNavigate={navigate} />
        <Footer onNotice={openNotice} onAuthOpen={openAuth} />
      </div>
      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
    </MotionConfig>
  );
}

export default App;
