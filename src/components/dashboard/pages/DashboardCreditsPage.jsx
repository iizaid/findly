import { useEffect, useState } from 'react';
import { WalletCards, TrendingDown, TrendingUp, Sparkles, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../../lib/api';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';

const DashboardCreditsPage = ({ credits, onUpdate }) => {
  const [history, setHistory] = useState({ status: 'loading', items: [] });
  const [summary, setSummary] = useState({ used: 0, received: 0 });

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      onUpdate?.(); // Ensure topbar balance is fresh when entering page
      try {
        const historyRes = await apiRequest('/api/credits/history?page=1&limit=15');
        
        if (active) {
          const items = historyRes.data.ledger?.items || [];
          
          let recentUsed = 0;
          let recentReceived = 0;
          
          items.forEach(item => {
            if (item.amount < 0) {
              recentUsed += Math.abs(item.amount);
            } else if (item.amount > 0) {
              recentReceived += item.amount;
            }
          });

          setHistory({ status: 'ready', items });
          setSummary({ 
            used: recentUsed,
            received: recentReceived
          });
        }
      } catch (error) {
        if (active) {
          setHistory({
            status: 'error',
            message: error instanceof ApiError ? error.message : 'Could not load credit history.',
            items: [],
          });
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [onUpdate]);

  const planName = credits?.plan === 'PRO' ? 'Pro Plan' : 'Free Plan';

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[1fr_minmax(400px,0.75fr)]">
      {/* Left Column: Overview and Info */}
      <div className="space-y-5">
        {/* Balance Card */}
        <DashboardCard className="relative overflow-hidden bg-black p-6 md:p-8 text-white">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/10 text-accent">
                <WalletCards size={24} />
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-white/60">Current balance</p>
              <p className="mt-2 text-6xl font-bold tracking-tighter sm:text-7xl">{credits?.balance ?? 0}</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
                <Sparkles size={14} className="text-accent" />
                {planName}
              </div>
            </div>
            
            <div className="flex flex-col gap-4 sm:min-w-[160px]">
              <div className="rounded-[18px] bg-white/5 p-4 border border-white/10">
                <div className="flex items-center gap-2 text-white/60">
                  <TrendingDown size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">Recent used</span>
                </div>
                <p className="mt-1 text-xl font-bold text-white">{summary.used}</p>
              </div>
              <div className="rounded-[18px] bg-white/5 p-4 border border-white/10">
                <div className="flex items-center gap-2 text-white/60">
                  <TrendingUp size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">Recent received</span>
                </div>
                <p className="mt-1 text-xl font-bold text-white">{summary.received}</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
        </DashboardCard>

        {/* Upgrade Card */}
        <DashboardCard className="p-6 md:p-8 bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Findly Billing</p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-black">Upgrades coming soon</h3>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-black/70">
            Paid credit packs and premium subscriptions are intentionally disabled during this phase. 
            All search scans, deep lead analyses, and list exports run on Opportunity Credits. You will be notified when billing opens.
          </p>
          <button type="button" disabled className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-black/5 px-6 text-sm font-bold text-black/40 cursor-not-allowed">
            Upgrade Plan
          </button>
        </DashboardCard>
      </div>

      {/* Right Column: Ledger */}
      <div className="space-y-5">
        <DashboardCard className="flex h-full flex-col p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Credit Ledger</h2>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-secondary mt-1">Recent History</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history.status === 'loading' ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center justify-between p-4 rounded-[18px] border border-black/5 bg-black/[0.02]">
                    <div className="space-y-2">
                      <div className="h-4 w-32 rounded bg-black/10 animate-pulse" />
                      <div className="h-3 w-24 rounded bg-black/5 animate-pulse" />
                    </div>
                    <div className="h-6 w-12 rounded bg-black/10 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : history.items.length > 0 ? (
              <div className="space-y-3">
                {history.items.map((item) => {
                  const isPositive = item.amount > 0;
                  const isNegative = item.amount < 0;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm hover:border-black/10 transition-colors">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-black">{item.reason}</p>
                        <p className="mt-1 text-xs font-semibold text-secondary">
                          {new Date(item.createdAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${isNegative ? 'text-red-600' : isPositive ? 'text-emerald-600' : 'text-black'}`}>
                          {isPositive ? '+' : ''}{item.amount}
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-secondary">{item.balanceAfter} total</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : history.status === 'error' ? (
              <div className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p className="text-sm font-bold">{history.message}</p>
              </div>
            ) : (
              <DashboardEmptyState
                title="No credit history yet"
                description="Your initial credits, search scans, and analysis usage will appear here."
              />
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardCreditsPage;
