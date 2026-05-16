import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Radio, Database, Upload, PenLine, Users, Rocket,
  FolderInput, ShieldAlert, Bug, RefreshCw, ShieldCheck, AlertCircle,
  KeyRound,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../../lib/api';
import DashboardCard from '../DashboardCard';

/* ---- panels ---- */
import AdminOverviewPanel from '../admin/panels/AdminOverviewPanel';
import AdminUsersPanel from '../admin/panels/AdminUsersPanel';
import AdminCampaignsPanel from '../admin/panels/AdminCampaignsPanel';
import AdminImportsPanel from '../admin/panels/AdminImportsPanel';
import AdminSecurityPanel from '../admin/panels/AdminSecurityPanel';
import AdminErrorsPanel from '../admin/panels/AdminErrorsPanel';
import AdminCatalogPanel from '../admin/panels/AdminCatalogPanel';
import AdminLiveActivityPanel from '../admin/panels/AdminLiveActivityPanel';
import AdminManualEntryPanel from '../admin/panels/AdminManualEntryPanel';
import AdminAiProvidersPanel from '../admin/panels/AdminAiProvidersPanel';
import AdminDetailPanel from '../admin/AdminDetailPanel';
import BulkImportCenter from './BulkImportCenter';

import { relTime } from '../admin/admin.utils';

/* ============================================================== */
/*  TAB CONFIG                                                     */
/* ============================================================== */
const TABS = [
  { id: 'overview',    label: 'Overview',       icon: LayoutDashboard },
  { id: 'live',        label: 'Live Activity',  icon: Radio },
  { id: 'catalog',     label: 'Data Catalog',   icon: Database },
  { id: 'bulk_import', label: 'Bulk Import',    icon: Upload },
  { id: 'manual',      label: 'Manual Entry',   icon: PenLine },
  { id: 'users',       label: 'Users',          icon: Users },
  { id: 'campaigns',   label: 'Campaigns',      icon: Rocket },
  { id: 'imports',     label: 'Imports',        icon: FolderInput },
  { id: 'security',    label: 'Security',       icon: ShieldAlert },
  { id: 'errors',      label: 'Errors',         icon: Bug },
  { id: 'ai',          label: 'AI Providers',   icon: KeyRound, rootOnly: true },
];

/* ============================================================== */
/*  MAIN COMPONENT                                                 */
/* ============================================================== */
const DashboardAdminPage = ({ user, onNavigate }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [activeTab, setActiveTab] = useState('overview');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detail, setDetail] = useState({ record: null, type: null });

  const openDetail = useCallback((record, type) => setDetail({ record, type }), []);
  const closeDetail = useCallback(() => setDetail({ record: null, type: null }), []);

  /* ---- data fetching ---- */
  const fetchAdminData = useCallback(async () => {
    const results = await Promise.allSettled([
      apiRequest('/api/admin/summary'),
      apiRequest('/api/admin/catalog/stats'),
      apiRequest('/api/admin/imports?limit=20'),
      apiRequest('/api/admin/campaigns?limit=20'),
      apiRequest('/api/admin/security/events?limit=20'),
      apiRequest('/api/admin/errors?limit=20'),
      apiRequest('/api/admin/system/status'),
    ]);

    const get = (i) => results[i].status === 'fulfilled' ? results[i].value.data : null;

    return {
      summary: get(0),
      catalog: get(1),
      imports: get(2)?.imports || [],
      campaigns: get(3)?.campaigns || [],
      security: get(4)?.events || [],
      errors: get(5)?.errors || [],
      systemStatus: get(6),
    };
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setState({ status: 'loading' });
    else setIsRefreshing(true);
    try {
      const data = await fetchAdminData();
      setState({ status: 'ready', data });
      setLastRefreshed(new Date());
    } catch (error) {
      if (!silent) {
        setState({
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'error',
          message: error instanceof ApiError ? error.message : 'Could not load admin operations.',
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAdminData]);

  useEffect(() => {
    let active = true;
    let intervalId = null;

    const run = async () => {
      try {
        const data = await fetchAdminData();
        if (active) { setState({ status: 'ready', data }); setLastRefreshed(new Date()); }
      } catch (error) {
        if (active) setState({
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'error',
          message: error instanceof ApiError ? error.message : 'Could not load admin operations.',
        });
      }
    };

    run();

    // Live polling every 15 seconds, pause when tab hidden
    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && active) loadData(true);
      }, 15000);
    };

    startPolling();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && active) loadData(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchAdminData, loadData]);

  // Close detail panel when switching tabs
  useEffect(() => { closeDetail(); }, [activeTab, closeDetail]);

  /* ---- guards ---- */
  const isAdminOrRoot = user?.role === 'ADMIN' || user?.role === 'ROOT';
  if (!isAdminOrRoot || state.status === 'denied') {
    return (
      <DashboardCard className="p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white">
          <ShieldCheck size={24} />
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight">Admin access required</h2>
        <p className="mt-3 max-w-lg text-sm font-semibold leading-7 text-secondary">
          This operations center is restricted to verified Findly administrators.
        </p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-bold text-white hover:bg-black/80 transition-colors">
          Back to dashboard
        </button>
      </DashboardCard>
    );
  }

  if (state.status === 'loading') return <AdminSkeleton />;

  if (state.status === 'error') {
    return (
      <DashboardCard className="p-8">
        <div className="flex items-start gap-3 text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-base">Failed to load Operations Center</p>
            <p className="mt-1 text-sm font-semibold text-secondary">{state.message}</p>
          </div>
        </div>
        <button type="button" onClick={() => loadData()} className="mt-5 rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white hover:bg-black/80 transition-colors">
          Retry
        </button>
      </DashboardCard>
    );
  }

  const { summary, catalog, imports, campaigns, security, errors, systemStatus } = state.data;
  const totals = summary?.totals || {};

  const counts = {
    users: totals.totalUsers,
    campaigns: totals.totalCampaigns,
    imports: imports?.length,
    security: security?.length,
    errors: errors?.length,
  };

  /* ---- Determine if detail panel should show for this tab ---- */
  const panelTabs = ['users', 'campaigns', 'imports', 'security', 'errors', 'live', 'catalog'];
  const showDetailColumn = detail.record && panelTabs.includes(activeTab);

  /* ---- Render active panel content ---- */
  const renderPanel = () => {
    switch (activeTab) {
      case 'overview':
        return <AdminOverviewPanel totals={totals} systemStatus={systemStatus} security={security} catalog={catalog} imports={imports} errors={errors} campaigns={campaigns} />;
      case 'live':
        return <AdminLiveActivityPanel onSelect={(r) => openDetail(r, 'activity')} />;
      case 'catalog':
        return <AdminCatalogPanel catalog={catalog} onSelect={(r) => openDetail(r, 'catalog')} />;
      case 'bulk_import':
        return <BulkImportCenter onSuccess={() => loadData(true)} />;
      case 'manual':
        return <AdminManualEntryPanel onSuccess={() => loadData(true)} />;
      case 'users':
        return <AdminUsersPanel currentUser={user} onSelect={(r) => openDetail(r, 'user')} />;
      case 'campaigns':
        return <AdminCampaignsPanel campaigns={campaigns} onSelect={(r) => openDetail(r, 'campaign')} />;
      case 'imports':
        return <AdminImportsPanel imports={imports} onSelect={(r) => openDetail(r, 'import')} />;
      case 'security':
        return <AdminSecurityPanel events={security} onSelect={(r) => openDetail(r, 'security')} />;
      case 'errors':
        return <AdminErrorsPanel errors={errors} onSelect={(r) => openDetail(r, 'error')} />;
      case 'ai':
        return <AdminAiProvidersPanel currentUser={user} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* ============ TOP COMMAND HEADER ============ */}
      <div className="rounded-[24px] border border-black/[0.04] bg-white p-6 md:p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2">Founder Operations</p>
            <h2 className="text-[28px] font-extrabold tracking-tight md:text-[32px] leading-none text-black">Findly Control Tower</h2>
            <p className="mt-2.5 text-[14px] font-medium text-secondary max-w-2xl leading-relaxed">
              Monitor platform health, users, lead data, imports, campaigns, security, and system activity.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 bg-black/[0.02] p-2 pr-3 rounded-2xl border border-black/[0.03]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black text-white">
              <ShieldCheck size={18} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col mr-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-secondary leading-none mb-1">{user?.role === 'ROOT' ? 'Root' : 'Admin'}</span>
              {user?.email && (
                <span className="text-[13px] font-bold text-black leading-none">{user.email}</span>
              )}
            </div>
            <div className="w-px h-8 bg-black/[0.06] mx-1" />
            <div className="flex flex-col items-end mr-1">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-secondary leading-none mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
              {lastRefreshed && (
                <span className="text-[12px] font-bold text-black leading-none whitespace-nowrap">
                  {relTime(lastRefreshed)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white border border-black/[0.06] text-black/60 shadow-sm transition-all hover:bg-black/[0.02] hover:text-black disabled:opacity-40 ml-1"
              aria-label="Refresh data"
            >
              <RefreshCw size={16} strokeWidth={2.5} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ============ PILL NAVIGATION ============ */}
      <div className="rounded-[18px] border border-black/[0.04] bg-white px-2 py-1.5 shadow-sm overflow-x-auto scrollbar-none">
        <nav className="flex gap-0.5 min-w-max" role="tablist">
          {TABS.filter((tab) => !tab.rootOnly || user?.role === 'ROOT').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = counts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-1.5 whitespace-nowrap rounded-[14px] px-3.5 py-2 text-[13px] font-bold transition-all ${
                  isActive
                    ? 'bg-black text-white shadow-sm'
                    : 'text-black/45 hover:bg-black/[0.03] hover:text-black/70'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-accent' : 'text-black/25 group-hover:text-black/40'} />
                {tab.label}
                {count > 0 && (
                  <span className={`ml-0.5 rounded-md px-1.5 py-px text-[10px] font-bold leading-none ${
                    isActive ? 'bg-white/15 text-white/80' : 'bg-black/[0.05] text-black/35'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ============ CONTENT + DETAIL PANEL ============ */}
      <div className={showDetailColumn ? 'grid gap-5 xl:grid-cols-[1fr_340px]' : ''}>
        <div className="min-w-0">
          {renderPanel()}
        </div>
        {showDetailColumn && (
          <div className="xl:sticky xl:top-4 self-start">
            <AdminDetailPanel record={detail.record} type={detail.type} onClose={closeDetail} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================== */
/*  LOADING SKELETON                                               */
/* ============================================================== */
const AdminSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    {/* Header skeleton */}
    <div className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
      <div className="h-3 w-28 rounded bg-black/[0.06] mb-2" />
      <div className="h-7 w-52 rounded-lg bg-black/[0.06] mb-2" />
      <div className="h-3 w-80 rounded bg-black/[0.04]" />
    </div>
    {/* Nav skeleton */}
    <div className="rounded-[18px] border border-black/[0.04] bg-white px-2 py-2.5 shadow-sm flex gap-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="h-8 w-24 rounded-[14px] bg-black/[0.04]" />
      ))}
    </div>
    {/* Content skeleton */}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-[22px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="h-9 w-9 rounded-2xl bg-black/[0.04] mb-4" />
          <div className="h-2.5 w-16 rounded bg-black/[0.06] mb-2" />
          <div className="h-6 w-12 rounded bg-black/[0.06]" />
        </div>
      ))}
    </div>
  </div>
);

export default DashboardAdminPage;
