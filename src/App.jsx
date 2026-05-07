import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import SearchSourcesStrip from './components/SearchSourcesStrip';
import ProductFilmSection from './components/ProductFilmSection';
import LoadingScreen from './components/LoadingScreen';
import OpportunityEngineSection from './components/OpportunityEngineSection';
import PricingSection from './components/PricingSection';
import Footer from './components/Footer';
import AuthPage from './components/AuthPage';
import NoticeModal from './components/NoticeModal';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState(null);
  const [notice, setNotice] = useState(null);

  const openAuth = useCallback((mode = 'signup', plan = null) => {
    setNotice(null);
    setAuthState({ mode, plan });
  }, []);

  const openNotice = useCallback((nextNotice) => {
    setNotice(nextNotice);
  }, []);

  useEffect(() => {
    if (isLoading || !window.location.hash) return;

    const target = window.location.hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
    }, 80);

    return () => clearTimeout(timer);
  }, [isLoading]);

  if (authState) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthPage
          initialMode={authState.mode}
          planContext={authState.plan}
          onClose={() => setAuthState(null)}
          onNotice={openNotice}
        />
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
        <Navbar ready={!isLoading} onAuthOpen={openAuth} />
        <Hero ready={!isLoading} onAuthOpen={openAuth} />
        <SearchSourcesStrip />
        <ProductFilmSection />
        <OpportunityEngineSection onNotice={openNotice} />
        <PricingSection onAuthOpen={openAuth} />
        <Footer onNotice={openNotice} onAuthOpen={openAuth} />
      </div>
      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
    </MotionConfig>
  );
}

export default App;
