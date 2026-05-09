import {
  BarChart3,
  ListChecks,
  LogOut,
  Map,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: BarChart3 },
  { label: 'Find Leads', path: '/dashboard/find-leads', icon: ScanSearch },
  { label: 'Lead Lists', path: '/dashboard/lead-lists', icon: ListChecks },
  { label: 'Lead Map', path: '/dashboard/map', icon: Map },
  { label: 'Analysis', path: '/dashboard/analysis', icon: Sparkles },
  { label: 'Credits', path: '/dashboard/credits', icon: WalletCards },
  { label: 'Settings', path: '/dashboard/settings', icon: Settings },
];

const isActivePath = (currentPath, itemPath) => {
  if (itemPath === '/dashboard') return currentPath === '/dashboard';
  return currentPath.startsWith(itemPath);
};

const DashboardSidebar = ({ user, workspace, currentPath, onNavigate, onLogout, onClose, drawer = false }) => {
  const items = user?.role === 'ADMIN'
    ? [...navItems, { label: 'Admin', path: '/dashboard/admin', icon: ShieldCheck }]
    : navItems;
  return (
    <aside className="flex h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-5 py-5">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          aria-label="Back to Findly website"
        >
          <img src="/findly-logo-auth.png" alt="Findly" className="h-9 w-auto" draggable={false} />
        </button>
        {drawer && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dashboard menu"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="mx-4 rounded-[18px] border border-white/10 bg-white/[0.07] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Workspace</p>
        <p className="mt-2 truncate text-sm font-bold text-white">{workspace?.name || 'Default workspace'}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/55">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Verified access
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('/dashboard/lead-lists')}
        className="mx-4 mt-3 flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-left text-white/45 transition-colors hover:bg-white/[0.11] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Search size={17} />
        <span className="text-sm font-semibold">Open lead lists</span>
        <span className="ml-auto rounded-lg bg-white/10 px-2 py-1 text-xs font-bold">/</span>
      </button>

      <nav className="mt-5 flex-1 px-3" aria-label="Dashboard navigation">
        <p className="px-2 text-xs font-bold uppercase tracking-[0.18em] text-white/35">Navigation</p>
        <div className="mt-3 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(currentPath, item.path);

            return (
              <button
                type="button"
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active ? 'bg-white text-black' : 'text-white/72 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-accent text-black' : 'bg-white/10 text-white'}`}>
                  <Icon size={17} />
                </span>
                {item.label}
                {active && <span className="ml-auto h-2 w-2 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-4 min-w-0">
          <p className="truncate text-sm font-bold">{user?.name || 'Findly user'}</p>
          <p className="mt-1 truncate text-xs font-semibold text-white/45">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
