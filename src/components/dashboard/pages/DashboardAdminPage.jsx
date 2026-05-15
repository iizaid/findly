import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Radio, Database, Upload, PenLine, Users, Rocket,
  FolderInput, ShieldAlert, Bug, RefreshCw, ShieldCheck, AlertCircle,
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
];

/* ============================================================== */
/*  MAIN COMPONENT                                                 */
/* ============================================================== */
const DashboardAdminPage = ({ user, onNavigate }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [activeTab, setActiveTab] = useState('overview');
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* ---- data fetching ---- */
  const fetchAdminData = useCallback(async () => {
    const results = await Promise.allSettled([
      apiRequest('/api/admin/summary'),
      apiRequest('/api/admin/users?limit=20'),
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
      users: get(1)?.users || [],
      catalog: get(2),
      imports: get(3)?.imports || [],
      campaigns: get(4)?.campaigns || [],
      security: get(5)?.events || [],
      errors: get(6)?.errors || [],
      systemStatus: get(7),
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
    return () => { active = false; };
  }, [fetchAdminData]);

  /* ---- guards ---- */
  if (user?.role !== 'ADMIN' || state.status === 'denied') {
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

  if (state.status === 'loading') {
    return <AdminSkeleton />;
  }

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

  const { summary, users, catalog, imports, campaigns, security, errors, systemStatus } = state.data;
  const totals = summary?.totals || {};

  /* ---- count badges for tabs ---- */
  const counts = {
    users: totals.totalUsers,
    campaigns: totals.totalCampaigns,
    imports: imports?.length,
    security: security?.length,
    errors: errors?.length,
  };

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Founder Operations</p>
            <span className="rounded-md bg-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Admin</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Operations Center</h2>
          <p className="mt-1.5 text-sm font-semibold text-secondary max-w-xl">
            Platform health, users, data catalog, campaigns, imports, and security — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <p className="text-[11px] font-semibold text-secondary whitespace-nowrap">
              Updated {relTime(lastRefreshed)}
            </p>
          )}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-black/60 transition-colors hover:bg-black/5 hover:text-black disabled:opacity-50"
            aria-label="Refresh data"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ============ TABS ============ */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
        <nav className="flex gap-1 min-w-max" role="tablist">
          {TABS.map((tab) => {
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
                className={`group flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-bold transition-all ${
                  isActive
                    ? 'bg-black text-white shadow-sm'
                    : 'text-black/50 hover:bg-black/[0.04] hover:text-black/80'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-accent' : 'text-black/30 group-hover:text-black/50'} />
                {tab.label}
                {count > 0 && (
                  <span className={`ml-0.5 rounded-md px-1.5 py-px text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-black/40'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ============ ACTIVE PANEL ============ */}
      {activeTab === 'overview' && (
        <AdminOverviewPanel totals={totals} systemStatus={systemStatus} security={security} errors={state.data.recentErrors} catalog={catalog} />
      )}

      {activeTab === 'live' && <AdminLiveActivityPanel />}

      {activeTab === 'catalog' && <AdminCatalogPanel catalog={catalog} />}

      {activeTab === 'bulk_import' && <BulkImportCenter onSuccess={() => loadData(true)} />}

      {activeTab === 'manual' && <AdminManualEntryPanel onSuccess={() => loadData(true)} />}

      {activeTab === 'users' && <AdminUsersPanel users={users} />}

      {activeTab === 'campaigns' && <AdminCampaignsPanel campaigns={campaigns} />}

      {activeTab === 'imports' && <AdminImportsPanel imports={imports} />}

      {activeTab === 'security' && <AdminSecurityPanel events={security} />}

      {activeTab === 'errors' && <AdminErrorsPanel errors={errors} />}
    </div>
  );
};

/* ============================================================== */
/*  LOADING SKELETON                                               */
/* ============================================================== */
const AdminSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div>
      <div className="h-3 w-32 rounded bg-black/[0.06] mb-3" />
      <div className="h-9 w-64 rounded-lg bg-black/[0.06] mb-2" />
      <div className="h-3.5 w-96 rounded bg-black/[0.04]" />
    </div>
    <div className="flex gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-9 w-24 rounded-xl bg-black/[0.05]" />
      ))}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
          <div className="h-10 w-10 rounded-2xl bg-black/[0.05] mb-5" />
          <div className="h-2.5 w-20 rounded bg-black/[0.06] mb-3" />
          <div className="h-7 w-16 rounded bg-black/[0.06]" />
        </div>
      ))}
    </div>
  </div>
);

export default DashboardAdminPage;
