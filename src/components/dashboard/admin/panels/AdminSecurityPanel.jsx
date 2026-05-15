import { ShieldAlert, AlertTriangle, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import { relTime, actionLabel, fmt } from '../admin.utils';

/* ============================================================== */
/*  SECURITY MONITOR PANEL                                         */
/* ============================================================== */
const AdminSecurityPanel = ({ events = [], onSelect }) => {
  const total = events.length;
  const warnings = events.filter(e => e.action?.includes('FAILED') || e.action?.includes('DENIED')).length;
  const critical = events.filter(e => e.action?.includes('LOCKOUT') || e.action?.includes('BRUTE')).length;
  const latestTime = events[0]?.createdAt;

  const getSeverity = (action) => {
    if (action?.includes('LOCKOUT') || action?.includes('BRUTE')) return 'critical';
    if (action?.includes('FAILED') || action?.includes('DENIED')) return 'warning';
    return 'info';
  };

  const severityConfig = {
    critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical', icon: AlertCircle },
    warning: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Warning', icon: AlertTriangle },
    info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Info', icon: ShieldAlert },
  };

  return (
    <div className="space-y-6">
      {/* SUMMARY */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Events</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(total)}</p>
        </div>
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Warnings</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-amber-600 leading-none">{fmt(warnings)}</p>
        </div>
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-red-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Critical</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-red-600 leading-none">{fmt(critical)}</p>
        </div>
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Latest Event</p>
          </div>
          <p className="text-[16px] font-bold text-black leading-tight">{latestTime ? relTime(latestTime) : 'None'}</p>
        </div>
      </section>

      {/* EVENT STREAM */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <h3 className="text-[16px] font-bold tracking-tight text-black">Security Audit Log</h3>
          <p className="text-[12px] font-medium text-secondary mt-0.5">Authentication, access, and session activity</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {events.length > 0 ? (
            <div className="space-y-1">
              {events.map((evt) => {
                const sev = getSeverity(evt.action);
                const config = severityConfig[sev];
                const Icon = config.icon;

                return (
                  <div
                    key={evt.id}
                    onClick={() => onSelect?.(evt)}
                    className="flex items-start gap-4 p-4 rounded-[16px] hover:bg-black/[0.02] transition-colors cursor-pointer group"
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                      <Icon size={16} className={config.text} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${config.bg} ${config.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                            {config.label}
                          </span>
                        </div>
                        <h4 className="text-[14px] font-bold text-black group-hover:text-accent transition-colors">
                          {actionLabel(evt.action)}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-[12px] font-semibold text-secondary">
                          <span>{evt.user?.email || 'System'}</span>
                          {evt.ipAddress && (
                            <>
                              <span className="text-black/20">•</span>
                              <span className="font-mono text-[11px]">{evt.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-secondary shrink-0">{relTime(evt.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 mb-4">
                <ShieldCheck size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">All clear</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">No security events to report.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminSecurityPanel;
