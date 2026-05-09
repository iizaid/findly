import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Menu, X } from 'lucide-react';

const navItems = [
  { label: 'Film', target: 'product-film' },
  { label: 'Engine', target: 'opportunity-engine' },
  { label: 'Pricing', target: 'pricing' },
];

const scrollToSection = (target) => {
  const element = document.getElementById(target);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const Navbar = ({ ready = false, currentUser, onAuthOpen, onNavigate, onLogout }) => {
  const [active, setActive] = useState('hero');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const sectionIds = ['hero', ...navItems.map((item) => item.target)];

    const updateScroll = () => {
      setIsScrolled(window.scrollY > 20);

      const current = sectionIds
        .map((id) => {
          const element = document.getElementById(id);
          if (!element) return null;
          return { id, top: element.getBoundingClientRect().top };
        })
        .filter((item) => item && item.top <= 180)
        .pop();

      if (current) setActive(current.id);
      else setActive('hero');
    };

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  const handleSectionClick = (target) => {
    scrollToSection(target);
    setMobileOpen(false);
  };

  const handleAuthClick = (mode) => {
    setMobileOpen(false);
    onAuthOpen?.(mode);
  };

  const handleDashboardClick = () => {
    setMobileOpen(false);
    onNavigate?.('/dashboard');
  };

  const handleLogoutClick = () => {
    setMobileOpen(false);
    onLogout?.();
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-4 pointer-events-none md:pt-6"
    >
      <div 
        className={`pointer-events-auto flex w-full max-w-[1100px] items-center justify-between rounded-full border transition-all duration-500 pl-4 pr-2 py-2 md:pl-6 md:pr-2.5 md:py-2 ${
          isScrolled 
            ? 'border-black/[0.08] bg-white/85 shadow-[0_14px_45px_rgba(0,0,0,0.06)] backdrop-blur-xl' 
            : 'border-transparent bg-transparent'
        }`}
      >
        
        {/* Left: Findly Logo */}
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
          className="shrink-0 rounded-xl pt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <img 
            src="/findly-logo-dark.png" 
            alt="Findly" 
            className="h-8 w-auto cursor-pointer md:h-[38px]"
            draggable={false}
          />
        </button>

        {/* Center: Navigation Links (Absolutely centered) */}
        <nav className="hidden absolute left-1/2 -translate-x-1/2 items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive = active === item.target;
            return (
              <button
                type="button"
                key={item.target}
                onClick={() => handleSectionClick(item.target)}
                className={`relative rounded-full px-5 py-2.5 text-[13px] font-bold transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  isActive ? 'text-black' : 'text-secondary hover:text-black'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-black/[0.04]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: CTA */}
        <div className="flex items-center gap-2">
          {currentUser ? (
            <>
              <button
                type="button"
                onClick={handleDashboardClick}
                className="hidden items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-black transition-colors duration-300 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:inline-flex"
              >
                <LayoutDashboard size={15} />
                {currentUser.emailVerified ? 'Dashboard' : 'Verify email'}
              </button>
              <button
                type="button"
                onClick={handleLogoutClick}
                className="rounded-full bg-black px-5 py-2.5 text-[13px] font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-6 md:py-3.5"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleAuthClick('login')}
                className="hidden rounded-full px-5 py-2.5 text-[13px] font-bold text-black transition-colors duration-300 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:inline-flex"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => handleAuthClick('signup')}
                className="rounded-full bg-black px-5 py-2.5 text-[13px] font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-7 md:py-3.5"
              >
                Create account
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-black transition-colors md:hidden ${
              isScrolled ? 'bg-black/[0.04]' : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)]'
            }`}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto absolute left-4 right-4 top-[78px] overflow-hidden rounded-[28px] border border-black/[0.08] bg-white p-3 shadow-[0_28px_90px_rgba(0,0,0,0.18)] md:hidden"
          >
            <nav className="grid gap-1">
              {navItems.map((item) => {
                const isActive = active === item.target;

                return (
                  <button
                    type="button"
                    key={item.target}
                    onClick={() => handleSectionClick(item.target)}
                    className={`flex items-center justify-between rounded-2xl px-5 py-3.5 text-left text-[15px] font-bold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isActive ? 'bg-[#F7F8F6] text-black' : 'text-secondary hover:bg-[#F7F8F6] hover:text-black'
                    }`}
                  >
                    {item.label}
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                );
              })}
            </nav>

            {currentUser ? (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/[0.06] pt-3">
                <button
                  type="button"
                  onClick={handleDashboardClick}
                  className="rounded-2xl border border-black/[0.08] px-4 py-3.5 text-sm font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {currentUser.emailVerified ? 'Dashboard' : 'Verify email'}
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="rounded-2xl bg-black px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => handleAuthClick('login')}
                  className="rounded-2xl border border-black/[0.08] px-4 py-3.5 text-sm font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => handleAuthClick('signup')}
                  className="rounded-2xl bg-black px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Create account
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
