import { useEffect, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { apiRequest, ApiError } from '../../../lib/api';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';

const DashboardCreditsPage = ({ credits }) => {
  const [history, setHistory] = useState({ status: 'loading', items: [] });

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        const response = await apiRequest('/api/credits/history?page=1&limit=10');
        if (active) setHistory({ status: 'ready', items: response.data.ledger.items || [] });
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

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[430px_minmax(0,1fr)]">
      <DashboardCard className="p-5 md:p-7">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
          <WalletCards size={26} />
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Current balance</p>
        <p className="mt-3 text-6xl font-bold tracking-tighter">{credits?.balance ?? 0}</p>
        <p className="mt-3 text-sm font-bold text-secondary">{credits?.plan || 'FREE'} plan</p>
        <p className="mt-6 text-sm font-semibold leading-7 text-secondary">
          Opportunity Credits will power search scans, lead analysis, outreach preparation, exports, and future discovery tools.
        </p>
        <div className="mt-7 rounded-[22px] bg-[#F7F8F6] p-5">
          <p className="text-sm font-bold">Billing coming later</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-secondary">
            Paid credit packs and plan upgrades are intentionally not connected yet.
          </p>
        </div>
      </DashboardCard>

      <DashboardCard className="p-5 md:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Credit ledger</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tighter">History</h2>
        {history.status === 'loading' ? (
          <div className="mt-7 space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-2xl bg-[#F7F8F6]" />
            ))}
          </div>
        ) : history.items.length > 0 ? (
          <div className="mt-7 space-y-3">
            {history.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-[#F7F8F6] px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{item.reason}</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-black">+{item.amount}</p>
                  <p className="mt-1 text-xs font-semibold text-secondary">{item.balanceAfter} balance</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-7">
            <DashboardEmptyState
              title="No credit history yet"
              description="Your initial credits, future search scans, analysis usage, outreach preparation, and export entries will appear here."
            />
          </div>
        )}
        {history.status === 'error' && <p className="mt-4 text-sm font-bold text-red-600">{history.message}</p>}
      </DashboardCard>
    </div>
  );
};

export default DashboardCreditsPage;
