import { Rocket, Search, CheckCircle2, AlertTriangle, Clock, MapPin, Database } from 'lucide-react';
import { fmt, relTime, sourceLabel, campaignStatusStyle } from '../admin.utils';

/* ============================================================== */
/*  CAMPAIGN MONITOR PANEL                                         */
/* ============================================================== */
const AdminCampaignsPanel = ({ campaigns = [], onSelect }) => {
  const total = campaigns.length;
  const completed = campaigns.filter(c => c.status === 'COMPLETED').length;
  const active = campaigns.filter(c => c.status === 'RUNNING' || c.status === 'PENDING').length;
  const failed = campaigns.filter(c => c.status === 'FAILED').length;

  const totalResults = campaigns.reduce((acc, c) => acc + (c.resultCount || 0), 0);
  const totalCredits = campaigns.reduce((acc, c) => acc + (c.creditsUsed || 0), 0);

  return (
    <div className="space-y-6">
      {/* SUMMARY METRICS */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Campaigns</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[32px] font-extrabold tracking-tight text-black leading-none">{fmt(total)}</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold text-secondary">
            {active} active, {failed} failed
          </p>
        </div>

        <div className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Success Rate</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[32px] font-extrabold tracking-tight text-emerald-600 leading-none">
              {total > 0 ? Math.round((completed / total) * 100) : 0}%
            </span>
          </div>
          <p className="mt-1 text-[12px] font-semibold text-emerald-600/70">
            {completed} completed successfully
          </p>
        </div>

        <div className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Leads Generated</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[32px] font-extrabold tracking-tight text-black leading-none">{fmt(totalResults)}</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold text-secondary">Across all lists</p>
        </div>

        <div className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Credits Burned</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[32px] font-extrabold tracking-tight text-black/60 leading-none">{fmt(totalCredits)}</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold text-secondary">System-wide usage</p>
        </div>
      </section>

      {/* CAMPAIGN LIST */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <h3 className="text-[16px] font-bold tracking-tight text-black">Campaign Monitor</h3>
          <p className="text-[12px] font-medium text-secondary mt-0.5">Real-time search execution status</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {campaigns.length > 0 ? (
            <div className="divide-y divide-black/[0.03]">
              {campaigns.map((camp) => {
                const s = campaignStatusStyle(camp.status);
                const isFailed = camp.status === 'FAILED';
                const isRunning = camp.status === 'RUNNING' || camp.status === 'PENDING';
                
                return (
                  <div 
                    key={camp.id} 
                    onClick={() => onSelect?.(camp)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-[#FAFAF9] transition-colors cursor-pointer group gap-5"
                  >
                    {/* Left: Identity */}
                    <div className="flex items-start gap-4 sm:w-2/5">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${isFailed ? 'bg-red-50 text-red-600' : isRunning ? 'bg-blue-50 text-blue-600' : 'bg-black/[0.03] text-black/50'}`}>
                        {isFailed ? <AlertTriangle size={18} /> : isRunning ? <Clock size={18} /> : <CheckCircle2 size={18} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[15px] font-bold text-black group-hover:text-accent transition-colors truncate">
                          {camp.name || 'Unnamed Campaign'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.bg}`}>
                            {s.label}
                          </span>
                          <span className="text-[11px] font-semibold text-secondary">
                            by {camp.user?.email || 'Unknown User'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Details */}
                    <div className="flex flex-col gap-2 sm:w-1/4">
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-black/70">
                        <Search size={12} className="text-black/30" />
                        <span className="truncate">"{camp.query}"</span>
                      </div>
                      {(camp.city || camp.country) && (
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-black/70">
                          <MapPin size={12} className="text-black/30" />
                          <span className="truncate">{camp.city ? `${camp.city}, ` : ''}{camp.country}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-black/70">
                        <Database size={12} className="text-black/30" />
                        <span className="truncate">
                          {(camp.sources || []).map(src => sourceLabel(src)).join(', ') || 'Auto'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Metrics & Time */}
                    <div className="flex flex-col items-end sm:w-1/4 shrink-0">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Results</p>
                          <p className="text-[14px] font-extrabold text-black">{fmt(camp.resultCount || 0)}</p>
                        </div>
                        <div className="w-px h-6 bg-black/[0.06]" />
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Credits</p>
                          <p className="text-[14px] font-extrabold text-black/60">{fmt(camp.creditsUsed || 0)}</p>
                        </div>
                      </div>
                      
                      <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
                        <Clock size={10} />
                        {camp.status === 'COMPLETED' ? `Finished ${relTime(camp.completedAt || camp.createdAt)}` : `Started ${relTime(camp.createdAt)}`}
                      </span>

                      {isFailed && camp.error && (
                        <span className="mt-1 inline-flex max-w-[200px] truncate rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600" title={camp.error}>
                          {camp.error}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/[0.02] text-black/20 mb-4">
                <Rocket size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">No campaigns found</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">Users have not run any search campaigns yet.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminCampaignsPanel;
