import { useState, useEffect } from 'react';
import {
  ArrowRight,
  BarChart3,
  Globe2,
  Loader2,
  ScanSearch,
  Sparkles,
  Target,
  Trophy,
  WalletCards,
  Zap,
} from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { apiRequest } from '../../../lib/api';

const workflowSteps = [
  { label: 'Search', icon: ScanSearch, desc: 'Define target' },
  { label: 'Collect', icon: Globe2, desc: 'Gather leads' },
  { label: 'Analyze', icon: Sparkles, desc: 'Score & rank' },
  { label: 'Export', icon: Target, desc: 'Take action' },
];

const sourceStatusIcon = (status) => {
  if (status === 'ready' || status === 'available') return '🟢';
  if (status === 'not_configured') return '🟡';
  if (status === 'unavailable' || status === 'error') return '🔴';
  return '⬜';
};

const DashboardHome = ({ onNavigate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiRequest('/api/search/intelligence');
        setData(res.data);
      } catch {
        // graceful fallback
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const s = data?.summary;
  const sources = data?.sources || [];

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-secondary" />
      </div>
    );
  }

  const hasData = s && (s.totalCampaigns > 0 || s.totalLeads > 0);

  return (
    <div className="space-y-5">
      {/* Workflow strip */}
      <DashboardCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-0">
          {workflowSteps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-2xl bg-black/[0.02] px-4 py-3 border border-black/5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent/20 text-black">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-black">{step.label}</p>
                    <p className="text-[11px] font-medium text-black/50">{step.desc}</p>
                  </div>
                </div>
                {i < workflowSteps.length - 1 && (
                  <ArrowRight size={14} className="hidden text-black/20 md:block" />
                )}
              </div>
            );
          })}
        </div>
      </DashboardCard>

      {/* Stats grid */}
      {hasData ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Campaigns', value: s.totalCampaigns, icon: BarChart3, color: 'bg-blue-100 text-blue-800' },
              { label: 'Leads Collected', value: s.totalLeads, icon: Globe2, color: 'bg-emerald-100 text-emerald-800' },
              { label: 'Gold Opportunities', value: s.goldOpportunities, icon: Trophy, color: 'bg-yellow-100 text-yellow-800' },
              { label: 'Credits Balance', value: s.creditsBalance, icon: WalletCards, color: 'bg-purple-100 text-purple-800' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <DashboardCard key={stat.label} className="flex items-start gap-4 p-5">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${stat.color} bg-opacity-10 text-opacity-80`}>
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-3xl font-bold tracking-tight text-black">{stat.value}</p>
                    <p className="mt-1 text-[13px] font-medium text-black/50">{stat.label}</p>
                  </div>
                </DashboardCard>
              );
            })}
          </div>

          {/* Recent campaigns + leads */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Recent campaigns */}
            <DashboardCard className="p-5 md:p-6">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-black">Recent Campaigns</p>
                <button type="button" onClick={() => onNavigate('/dashboard/find-leads')} className="text-[12px] font-medium text-blue-600 hover:underline">View all</button>
              </div>
              <div className="mt-4 space-y-2">
                {s.recentCampaigns?.length > 0 ? s.recentCampaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-black/[0.02] px-4 py-3 border border-black/[0.04]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-black">{c.name}</p>
                      <p className="text-[11px] font-medium text-black/50">{c.resultCount} leads • {c.creditsUsed} credits</p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                      c.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
                      c.status === 'RUNNING' ? 'bg-blue-50 text-blue-700' :
                      c.status === 'FAILED' ? 'bg-red-50 text-red-700' :
                      'bg-black/5 text-black/60'
                    }`}>{c.status}</span>
                  </div>
                )) : <p className="text-[13px] text-black/40 text-center py-4">No campaigns yet</p>}
              </div>
            </DashboardCard>

            {/* Recent leads */}
            <DashboardCard className="p-5 md:p-6">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-black">Recent Leads</p>
                <button type="button" onClick={() => onNavigate('/dashboard/lead-lists')} className="text-[12px] font-medium text-blue-600 hover:underline">View all</button>
              </div>
              <div className="mt-4 space-y-2">
                {s.recentLeads?.length > 0 ? s.recentLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-xl bg-black/[0.02] px-4 py-3 border border-black/[0.04]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-black">{l.businessName}</p>
                      <p className="text-[11px] font-medium text-black/50">{l.category} • {l.city} {l.rating ? `• ${l.rating}★` : ''}</p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                      l.status === 'NEW' ? 'bg-accent/20 text-black/80' : 'bg-black/5 text-black/60'
                    }`}>{l.status.replace(/_/g, ' ')}</span>
                  </div>
                )) : <p className="text-[13px] text-black/40 text-center py-4">No leads yet</p>}
              </div>
            </DashboardCard>
          </div>
        </>
      ) : (
        /* Empty state */
        <DashboardCard className="p-7 md:p-10">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-black">
              <Zap size={28} />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tighter md:text-4xl">Start discovering opportunities.</h2>
            <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-7 text-secondary">
              Create your first search campaign to start building your opportunity database. Findly will collect, analyze, and score leads automatically.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/dashboard/find-leads')}
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
            >
              <ScanSearch size={16} />
              Create first campaign
            </button>
          </div>
        </DashboardCard>
      )}

      {/* Source status */}
      <DashboardCard className="p-5 md:p-6">
        <p className="text-[14px] font-semibold text-black">Data Sources</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {sources.map((src) => (
            <div key={src.key} className="flex items-center gap-3 rounded-xl border border-black/5 bg-black/[0.01] px-4 py-3">
              <span className="text-sm">{sourceStatusIcon(src.status)}</span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-black">{src.label}</p>
                <p className="text-[11px] font-medium text-black/50 capitalize">{src.status.replace('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
};

export default DashboardHome;
