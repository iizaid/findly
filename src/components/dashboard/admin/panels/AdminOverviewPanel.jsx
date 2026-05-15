import { Users, ShieldCheck, Database, Rocket, FolderInput, Bug, ShieldAlert, TrendingUp } from 'lucide-react';
import { fmt, systemStatusStyle, actionLabel } from '../admin.utils';

/* ============================================================== */
/*  STAT CARD                                                      */
/* ============================================================== */
const StatCard = ({ label, value, context, icon: Icon, accent = false }) => (
  <div className={`rounded-[20px] border bg-white p-5 shadow-sm transition-all hover:shadow-md ${accent ? 'border-accent/20' : 'border-black/[0.04]'}`}>
    <div className="flex items-start justify-between">
      <div className={`flex h-10 w-10 items-center justify-center rounded-[14px] ${accent ? 'bg-accent text-black' : 'bg-black/[0.04] text-black/50'}`}>
        <Icon size={18} />
      </div>
    </div>
    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{label}</p>
    <p className="mt-1 text-[28px] font-bold tracking-tight text-black leading-none">{fmt(value)}</p>
    {context && <p className="mt-1.5 text-[11px] font-semibold text-secondary">{context}</p>}
  </div>
);

/* ============================================================== */
/*  SYSTEM HEALTH CARD                                             */
/* ============================================================== */
const HealthRow = ({ label, status, detail }) => {
  const s = systemStatusStyle(status);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-black/[0.04] last:border-0">
      <span className="text-[13px] font-semibold text-black/80">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-[11px] font-semibold text-secondary">{detail}</span>}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${s.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
    </div>
  );
};

const SystemHealthCard = ({ systemStatus }) => {
  if (!systemStatus) return null;
  return (
    <section className="rounded-[20px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-black/[0.04] bg-[#FAFAF9]">
        <h3 className="text-sm font-bold tracking-tight text-black">System Health</h3>
        <p className="text-[11px] font-semibold text-secondary mt-0.5">Infrastructure & source readiness</p>
      </div>
      <div className="px-5 py-2">
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
  );
};

/* ============================================================== */
/*  COMPACT EVENT LIST CARD                                        */
/* ============================================================== */
const EventListCard = ({ title, subtitle, events, emptyText, renderRow }) => (
  <section className="rounded-[20px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-black/[0.04] bg-[#FAFAF9]">
      <h3 className="text-sm font-bold tracking-tight text-black">{title}</h3>
      <p className="text-[11px] font-semibold text-secondary mt-0.5">{subtitle}</p>
    </div>
    <div className="px-5 py-1.5">
      {events.length > 0 ? (
        events.slice(0, 5).map((evt, i) => (
          <div key={evt.id || i} className="flex items-center justify-between py-2.5 border-b border-black/[0.04] last:border-0 gap-3">
            {renderRow(evt)}
          </div>
        ))
      ) : (
        <div className="py-8 text-center">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-accent" />
          <p className="text-[13px] font-bold text-black">Nothing here</p>
          <p className="text-[11px] text-secondary mt-0.5">{emptyText}</p>
        </div>
      )}
    </div>
  </section>
);

/* ============================================================== */
/*  CATALOG COVERAGE WIDGET                                        */
/* ============================================================== */
const CatalogCoverageCard = ({ catalog }) => {
  if (!catalog) return null;
  const topCategories = (catalog.byCategory || []).slice(0, 5);
  const topLocations = (catalog.byGovernorate || []).slice(0, 5);
  const maxCatCount = topCategories[0]?.count || 1;
  const maxLocCount = topLocations[0]?.count || 1;

  return (
    <section className="rounded-[20px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-black/[0.04] bg-[#FAFAF9]">
        <h3 className="text-sm font-bold tracking-tight text-black">Catalog Coverage</h3>
        <p className="text-[11px] font-semibold text-secondary mt-0.5">{fmt(catalog.total)} total indexed records</p>
      </div>
      <div className="p-5 grid gap-5 sm:grid-cols-2">
        {/* Categories */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-2.5">Top Categories</p>
          <div className="space-y-2">
            {topCategories.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-black/80 truncate mr-2">{c.category}</span>
                  <span className="text-[11px] font-bold tabular-nums text-secondary">{fmt(c.count)}</span>
                </div>
                <div className="h-1 rounded-full bg-black/[0.05] overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(c.count / maxCatCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Locations */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-2.5">Top Locations</p>
          <div className="space-y-2">
            {topLocations.map((g) => (
              <div key={g.governorate}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-black/80 truncate mr-2">{g.governorate}</span>
                  <span className="text-[11px] font-bold tabular-nums text-secondary">{fmt(g.count)}</span>
                </div>
                <div className="h-1 rounded-full bg-black/[0.05] overflow-hidden">
                  <div className="h-full rounded-full bg-black/30 transition-all" style={{ width: `${(g.count / maxLocCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ============================================================== */
/*  MAIN OVERVIEW PANEL                                            */
/* ============================================================== */
const AdminOverviewPanel = ({ totals = {}, systemStatus, security = [], catalog }) => {


  return (
    <div className="space-y-5">
      {/* ---- Primary Metrics ---- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={totals.totalUsers} icon={Users} accent />
        <StatCard
          label="Verified Users"
          value={totals.verifiedUsers}
          icon={ShieldCheck}
          context={totals.totalUsers ? `${Math.round((totals.verifiedUsers / totals.totalUsers) * 100)}% of all users` : null}
        />
        <StatCard label="Catalog Records" value={totals.totalCatalogLeads} icon={Database} />
        <StatCard label="Search Campaigns" value={totals.totalCampaigns} icon={Rocket} />
      </div>

      {/* ---- Secondary Metrics ---- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Dataset Imports" value={totals.totalDatasetImports} icon={FolderInput} />
        <StatCard label="Lead Lists" value={totals.totalLeadLists} icon={TrendingUp} />
        <StatCard
          label="Recent Errors"
          value={totals.recentErrors}
          icon={Bug}
          context={totals.recentErrors > 0 ? 'Last 8 tracked' : 'All clear'}
        />
        <StatCard
          label="Security Events"
          value={totals.recentSecurityEvents}
          icon={ShieldAlert}
          context={totals.recentSecurityEvents > 0 ? 'Last 8 tracked' : 'All clear'}
        />
      </div>

      {/* ---- Bento Grid: Health + Security + Catalog ---- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SystemHealthCard systemStatus={systemStatus} />

        <EventListCard
          title="Security Events"
          subtitle="Recent authentication & access events"
          events={security}
          emptyText="No events to display."
          renderRow={(evt) => (
            <>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-black/80 truncate">{actionLabel(evt.action)}</p>
                <p className="text-[11px] text-secondary truncate">{evt.user?.email || 'System'}</p>
              </div>
              <p className="text-[11px] font-semibold text-secondary whitespace-nowrap shrink-0">
                {evt.createdAt ? new Date(evt.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
              </p>
            </>
          )}
        />
      </div>

      {/* ---- Catalog Coverage (full width) ---- */}
      <CatalogCoverageCard catalog={catalog} />
    </div>
  );
};

export default AdminOverviewPanel;
