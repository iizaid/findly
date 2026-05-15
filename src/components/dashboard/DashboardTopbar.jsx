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
    <header className="flex flex-col gap-4 pb-6 pt-2 md:flex-row md:items-center md:justify-between border-b border-black/[0.04]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="Open dashboard menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black shadow-sm outline-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black md:text-3xl">{meta.title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('/dashboard/credits')}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-[13px] font-medium text-black shadow-sm outline-none ring-1 ring-black/5 transition-all hover:bg-black/[0.02] focus-visible:ring-2 focus-visible:ring-accent"
        >
          <WalletCards size={16} className="text-black/50" />
          {credits?.balance ?? 0}
        </button>
        <button
          type="button"
          aria-label="Open settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black/70 shadow-sm outline-none ring-1 ring-black/5 transition-all hover:bg-black/[0.02] hover:text-black focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onNavigate('/dashboard/settings')}
        >
          <Settings size={18} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/dashboard/find-leads')}
          className="hidden h-10 items-center gap-2 rounded-xl bg-black px-4 text-[13px] font-medium text-white shadow-md outline-none transition-all hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
        >
          <ScanSearch size={16} />
          Find Leads
        </button>
      </div>
    </header>
  );
};

export default DashboardTopbar;
