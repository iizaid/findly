import { Bug, AlertCircle, Clock, Copy, CheckCircle2, Server, FileWarning } from 'lucide-react';
import { relTime, fmt } from '../admin.utils';
import { useState } from 'react';

/* ============================================================== */
/*  COPY BUTTON                                                    */
/* ============================================================== */
const CopyBtn = ({ value }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[11px] text-secondary">—</span>;
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1 text-[10px] font-mono text-black/40 hover:text-black transition-colors" title="Copy Request ID">
      {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
      {value.split('-')[0]}
    </button>
  );
};

/* ============================================================== */
/*  ERROR INCIDENT PANEL                                           */
/* ============================================================== */
const AdminErrorsPanel = ({ errors = [], onSelect }) => {
  const total = errors.length;
  const count5xx = errors.filter(e => e.statusCode >= 500).length;
  const count4xx = errors.filter(e => e.statusCode >= 400 && e.statusCode < 500).length;


  // Most common route
  const routeCount = {};
  errors.forEach(e => {
    if (e.route) routeCount[e.route] = (routeCount[e.route] || 0) + 1;
  });
  const topRoute = Object.entries(routeCount).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-6">
      {/* SUMMARY */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Bug size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Errors</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(total)}</p>
        </div>
        <div className="rounded-[20px] border border-red-100 bg-red-50/30 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-red-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Server (5xx)</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-red-600 leading-none">{fmt(count5xx)}</p>
          <p className="mt-1 text-[12px] font-semibold text-red-600/70">{count5xx > 0 ? 'Needs review' : 'All clear'}</p>
        </div>
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileWarning size={14} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Client (4xx)</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-amber-600 leading-none">{fmt(count4xx)}</p>
        </div>
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Hotspot</p>
          </div>
          <p className="text-[14px] font-bold text-black leading-tight truncate" title={topRoute?.[0]}>
            {topRoute ? topRoute[0] : 'None'}
          </p>
          <p className="mt-1 text-[12px] font-semibold text-secondary">{topRoute ? `${topRoute[1]} occurrences` : 'No patterns'}</p>
        </div>
      </section>

      {/* ERROR LIST */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <h3 className="text-[16px] font-bold tracking-tight text-black">Incident Log</h3>
          <p className="text-[12px] font-medium text-secondary mt-0.5">Tracked backend errors and failures</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {errors.length > 0 ? (
            <div className="space-y-1">
              {errors.map((err) => {
                const is5xx = err.statusCode >= 500;

                return (
                  <div
                    key={err.id}
                    onClick={() => onSelect?.(err)}
                    className="flex items-start gap-4 p-4 rounded-[16px] hover:bg-black/[0.02] transition-colors cursor-pointer group"
                  >
                    {/* Status badge */}
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${is5xx ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      {err.statusCode || '?'}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${is5xx ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {is5xx ? 'SERVER' : 'CLIENT'}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-black/[0.04] px-2 py-0.5 text-[9px] font-bold font-mono text-black/60">
                            {err.errorCode || 'UNKNOWN'}
                          </span>
                        </div>
                        <h4 className="text-[14px] font-bold text-black group-hover:text-accent transition-colors truncate">
                          <span className="text-[11px] font-bold text-secondary mr-1">{err.method}</span>
                          {err.route || 'Unknown route'}
                        </h4>
                        <p className="text-[12px] font-medium text-secondary truncate mt-0.5 max-w-xl" title={err.message}>
                          {err.message || 'No message'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] font-bold text-secondary flex items-center gap-1">
                          <Clock size={10} />
                          {relTime(err.createdAt)}
                        </span>
                        <CopyBtn value={err.requestId} />
                        {err.user?.email && (
                          <span className="text-[10px] font-semibold text-secondary">{err.user.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 mb-4">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">No errors recorded</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">Backend is running cleanly.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminErrorsPanel;
