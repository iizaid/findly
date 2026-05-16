import {
  BarChart3,
  ListChecks,
  LogOut,
  Map,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import { getAssetUrl } from '../../lib/assets';

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

const DashboardSidebar = ({ user, workspace, credits, currentPath, onNavigate, onLogout, onClose, drawer = false }) => {
  const planName = credits?.planId === 'PRO' ? 'Pro Plan' : 'Free Plan';
  const items = user?.role === 'ADMIN'
    ? [...navItems, { label: 'Admin', path: '/dashboard/admin', icon: ShieldCheck }]
    : navItems;

  return (
    <aside className="flex h-full flex-col bg-[#000000] text-white/90 selection:bg-accent selection:text-black">
      {/* Header */}
      <div className="flex h-20 shrink-0 items-center justify-between px-6">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="Back to Findly website"
        >
          <img src="/findly-logo-auth.png" alt="Findly" className="h-7 w-auto opacity-90 transition-opacity hover:opacity-100" draggable={false} />
        </button>
        {drawer && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dashboard menu"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Workspace Context */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.06] p-3 backdrop-blur-md">
          {user?.avatarUrl ? (
            <img src={getAssetUrl(user.avatarUrl)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover shadow-inner" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/5 shadow-inner">
              <span className="text-sm font-semibold text-white">{workspace?.name?.charAt(0)?.toUpperCase() || 'W'}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{workspace?.name || 'Workspace'}</p>
            <p className="truncate text-[11px] text-white/50">{planName}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Dashboard navigation">
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(currentPath, item.path);

            return (
              <button
                type="button"
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] outline-none transition-all duration-200 ${
                  active 
                    ? 'bg-white/10 font-medium text-white shadow-sm backdrop-blur-lg' 
                    : 'font-normal text-white/70 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon 
                  size={18} 
                  className={`shrink-0 transition-colors ${active ? 'text-accent' : 'text-white/50 group-hover:text-white/80'}`} 
                  strokeWidth={active ? 2.5 : 2} 
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* User Profile Footer */}
      <div className="mt-auto shrink-0 p-4">
        <button
          type="button"
          onClick={onLogout}
          className="group flex w-full items-center gap-3 rounded-[14px] p-2 outline-none transition-colors hover:bg-white/[0.06]"
        >
          {user?.avatarUrl ? (
            <div className="relative h-9 w-9 shrink-0">
              <img src={getAssetUrl(user.avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <LogOut size={14} className="text-white" />
              </div>
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors group-hover:bg-white/20 group-hover:text-white">
              <LogOut size={16} />
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-medium text-white/90">{user?.name || 'Account'}</p>
            <p className="truncate text-[11px] text-white/50">Log out</p>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
