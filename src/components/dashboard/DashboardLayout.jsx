import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import DashboardSidebar from './DashboardSidebar';
import DashboardTopbar from './DashboardTopbar';

const DashboardLayout = ({ children, user, workspace, credits, routePath, onNavigate, onLogout }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const handleNavigate = (path) => {
    setDrawerOpen(false);
    onNavigate(path);
  };

  return (
    <main className="h-screen w-full bg-[#eef1ed] text-black overflow-hidden">
      <div className="grid h-full bg-[#F7F8F6] lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="hidden lg:block h-full">
          <DashboardSidebar user={user} workspace={workspace} currentPath={routePath} onNavigate={handleNavigate} onLogout={onLogout} />
        </div>

        <section className="min-w-0 h-full overflow-y-auto px-4 py-5 md:px-6 md:py-6 xl:px-8 2xl:px-10">
          <DashboardTopbar
            routePath={routePath}
            credits={credits}
            onNavigate={onNavigate}
            onMenuOpen={() => setDrawerOpen(true)}
          />
          <motion.div
            key={routePath}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5"
          >
            {children}
          </motion.div>
        </section>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
          >
            <motion.div
              className="h-full w-[min(86vw,340px)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <DashboardSidebar
                user={user}
                workspace={workspace}
                currentPath={routePath}
                onNavigate={handleNavigate}
                onLogout={onLogout}
                onClose={() => setDrawerOpen(false)}
                drawer
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};

export default DashboardLayout;
