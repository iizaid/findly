import { Menu, ScanSearch, Settings, WalletCards } from 'lucide-react';

const pageTitles = {
  '/dashboard': {
    title: 'Dashboard',
    eyebrow: 'Findly workspace',
  },
  '/dashboard/find-leads': {
    title: 'Find Leads',
    eyebrow: 'Search campaign',
  },
  '/dashboard/lead-lists': {
    title: 'Lead Lists',
    eyebrow: 'Collected opportunities',
  },
  '/dashboard/analysis': {
    title: 'Analysis',
    eyebrow: 'Opportunity scoring',
  },
  '/dashboard/credits': {
    title: 'Credits',
    eyebrow: 'Usage foundation',
  },
  '/dashboard/settings': {
    title: 'Settings',
    eyebrow: 'Account and workspace',
  },
};

const DashboardTopbar = ({ routePath, credits, onNavigate, onMenuOpen }) => {
  const meta = pageTitles[routePath] || pageTitles['/dashboard'];

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="Open dashboard menu"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/[0.08] bg-white text-black shadow-[0_12px_35px_rgba(0,0,0,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">{meta.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tighter md:text-4xl xl:text-5xl">{meta.title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('/dashboard/credits')}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-bold text-black transition-colors hover:bg-[#F7F8F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <WalletCards size={17} />
          {credits?.balance ?? 0} credits
        </button>
        <button
          type="button"
          aria-label="Open settings"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[0.08] bg-white text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => onNavigate('/dashboard/settings')}
        >
          <Settings size={17} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/dashboard/find-leads')}
          className="hidden h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
        >
          <ScanSearch size={17} />
          Find Leads
        </button>
      </div>
    </header>
  );
};

export default DashboardTopbar;
