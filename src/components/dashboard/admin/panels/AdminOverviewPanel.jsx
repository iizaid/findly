import { Users, ShieldCheck, Database, Rocket, FolderInput, Bug, ShieldAlert, TrendingUp } from 'lucide-react';
import { fmt, systemStatusStyle } from '../admin.utils';

/* ---- Stat Card ---- */
const StatCard = ({ label, value, context, icon: Icon, accent = false }) => (
  <div className={`rounded-[22px] border bg-white p-5 shadow-sm transition-colors ${accent ? 'border-accent/20' : 'border-black/[0.04]'}`}>
    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${accent ? 'bg-accent text-black' : 'bg-black/[0.04] text-black/60'}`}>
      <Icon size={18} />
    </div>
    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{label}</p>
    <p className="mt-1.5 text-2xl font-bold tracking-tight text-black">{fmt(value)}</p>
    {context && <p className="mt-1 text-[11px] font-semibold text-secondary">{context}</p>}
  </div>
);

/* ---- System Health Row ---- */
const HealthRow = ({ label, status, detail }) => {
  const s = systemStatusStyle(status);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-black/[0.04] last:border-0">
      <span className="text-sm font-semibold text-black/80">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-[11px] font-semibold text-secondary">{detail}</span>}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
    </div>
  );
};

const AdminOverviewPanel = ({ totals = {}, systemStatus, security = [], catalog }) => (
  <div className="space-y-6">
    {/* ---- Metric Groups ---- */}
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-3">Platform Health</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Users" value={totals.totalUsers} icon={Users} accent />
        <StatCard label="Verified Users" value={totals.verifiedUsers} icon={ShieldCheck} context={totals.totalUsers ? `${Math.round((totals.verifiedUsers / totals.totalUsers) * 100)}% verified` : null} />
        <StatCard label="Catalog Records" value={totals.totalCatalogLeads} icon={Database} />
        <StatCard label="Search Campaigns" value={totals.totalCampaigns} icon={Rocket} />
      </div>
    </div>

    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-3">Data & Operations</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dataset Imports" value={totals.totalDatasetImports} icon={FolderInput} />
        <StatCard label="Lead Lists" value={totals.totalLeadLists} icon={TrendingUp} />
        <StatCard label="Recent Errors" value={totals.recentErrors} icon={Bug} context={totals.recentErrors > 0 ? 'Last 8 entries' : 'No recent errors'} />
        <StatCard label="Security Events" value={totals.recentSecurityEvents} icon={ShieldAlert} context={totals.recentSecurityEvents > 0 ? 'Last 8 entries' : 'All clear'} />
      </div>
    </div>

    {/* ---- System Health + Quick View ---- */}
    <div className="grid gap-5 xl:grid-cols-2">
      {systemStatus && (
        <section className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold tracking-tight text-black mb-4">System Health</h3>
          <div>
            <HealthRow label={systemStatus.database?.label || 'Database'} status={systemStatus.database?.status} />
            <HealthRow
              label={systemStatus.localDataset?.label || 'Local Dataset'}
              status={systemStatus.localDataset?.status}
              detail={systemStatus.localDataset?.totalCatalogLeads ? `${fmt(systemStatus.localDataset.totalCatalogLeads)} records` : null}
            />
            <HealthRow
              label={systemStatus.importPipeline?.label || 'Import Pipeline'}
              status={systemStatus.importPipeline?.status}
              detail={systemStatus.importPipeline?.status === 'available' ? `${systemStatus.importPipeline.ttlMinutes}m TTL` : null}
            />
            {systemStatus.sources?.map((src) => (
              <HealthRow
                key={src.key}
                label={src.label}
                status={src.status === 'coming_later' ? 'coming_later' : src.available ? 'available' : 'not_configured'}
              />
            ))}
            <HealthRow label={systemStatus.aiProviders?.label || 'AI Providers'} status={systemStatus.aiProviders?.status || 'not_implemented'} />
          </div>
        </section>
      )}

      {/* Quick security peek */}
      <section className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold tracking-tight text-black mb-4">Recent Security Events</h3>
        {security.length > 0 ? (
          <div className="space-y-0">
            {security.slice(0, 6).map((evt) => (
              <div key={evt.id} className="flex items-center justify-between py-2.5 border-b border-black/[0.04] last:border-0">
                <div>
                  <p className="text-sm font-semibold text-black/80">{evt.action?.replace(/_/g, ' ') || 'Event'}</p>
                  <p className="text-[11px] text-secondary">{evt.user?.email || 'System'}</p>
                </div>
                <p className="text-[11px] font-semibold text-secondary whitespace-nowrap">
                  {evt.createdAt ? new Date(evt.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-accent" />
            <p className="text-sm font-bold text-black">No events</p>
            <p className="text-xs text-secondary mt-1">Security events will appear here.</p>
          </div>
        )}
      </section>
    </div>
  </div>
);

export default AdminOverviewPanel;
