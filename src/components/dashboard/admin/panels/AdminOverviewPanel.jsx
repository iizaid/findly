import { 
  Users, Database, Rocket, FolderInput, Bug, ShieldAlert, 
  Activity, AlertCircle, CheckCircle2, AlertTriangle, FileUp 
} from 'lucide-react';
import { fmt, systemStatusStyle, actionLabel } from '../admin.utils';

/* ============================================================== */
/*  PREMIUM STAT CARD                                              */
/* ============================================================== */
const StatCard = ({ label, value, context, icon: Icon, accent = false }) => (
  <div className="flex flex-col justify-between rounded-[24px] border border-black/[0.04] bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.06)] relative overflow-hidden group">
    {accent && (
      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-accent/10 blur-2xl group-hover:bg-accent/20 transition-all" />
    )}
    <div className="relative z-10 flex items-start justify-between">
      <div className={`flex h-12 w-12 items-center justify-center rounded-[16px] ${accent ? 'bg-accent/10 text-accent' : 'bg-black/[0.03] text-black/50'}`}>
        <Icon size={20} strokeWidth={2.5} />
      </div>
    </div>
    <div className="relative z-10 mt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-secondary">{label}</p>
      <p className="mt-1.5 text-[32px] font-extrabold tracking-tight text-black leading-none">{fmt(value)}</p>
      {context && <p className="mt-2 text-[12px] font-semibold text-secondary">{context}</p>}
    </div>
  </div>
);

/* ============================================================== */
/*  PLATFORM PULSE CARD                                            */
/* ============================================================== */
const PulseRow = ({ label, status, detail, icon: Icon }) => {
  const s = systemStatusStyle(status);
  return (
    <div className="flex items-center justify-between py-3 border-b border-black/[0.03] last:border-0 group">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${s.bg}`}>
          <Icon size={14} className={s.dot.replace('bg-', 'text-')} strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-[14px] font-bold text-black/80">{label}</span>
          {detail && <p className="text-[11px] font-semibold text-secondary mt-0.5">{detail}</p>}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${s.bg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
    </div>
  );
};

const PlatformPulseCard = ({ systemStatus }) => {
  if (!systemStatus) return null;
  return (
    <section className="flex flex-col rounded-[24px] border border-black/[0.04] bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] h-full">
      <div className="px-6 py-5 border-b border-black/[0.03] flex items-center gap-3">
        <Activity size={18} className="text-black/40" />
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-black">Platform Pulse</h3>
          <p className="text-[12px] font-semibold text-secondary mt-0.5">Live infrastructure & service health</p>
        </div>
      </div>
      <div className="p-6 flex-1 flex flex-col justify-center">
        <PulseRow 
          label="Data Index" 
          icon={Database}
          status={systemStatus.localDataset?.status} 
          detail={systemStatus.localDataset?.totalCatalogLeads ? `${fmt(systemStatus.localDataset.totalCatalogLeads)} core records available` : 'Indexing...'} 
        />
        <PulseRow 
          label="Database" 
          icon={Database}
          status={systemStatus.database?.status} 
          detail="PostgreSQL Main Cluster"
        />
        <PulseRow 
          label="Import Pipeline" 
          icon={FileUp}
          status={systemStatus.importPipeline?.status} 
          detail={systemStatus.importPipeline?.status === 'available' ? 'Processing active queues' : 'Idle'} 
        />
        <PulseRow 
          label="Application Health" 
          icon={Activity}
          status="available" 
          detail="API Services responding"
        />
        <PulseRow 
          label="Search Sources" 
          icon={Rocket}
          status={(systemStatus.sources || []).some(s => s.status !== 'available') ? 'degraded' : 'available'} 
          detail="External providers readiness"
        />
      </div>
    </section>
  );
};

/* ============================================================== */
/*  NEEDS ATTENTION (RISK RAIL)                                    */
/* ============================================================== */
const NeedsAttentionCard = ({ errors, imports, campaigns, security }) => {
  const issues = [];

  const serverErrors = errors?.filter(e => e.statusCode >= 500) || [];
  if (serverErrors.length > 0) {
    issues.push({
      id: 'err',
      type: 'critical',
      icon: AlertCircle,
      title: `${serverErrors.length} Critical Errors`,
      desc: '5xx backend errors require review',
    });
  }

  const failedImports = imports?.filter(i => i.status === 'FAILED') || [];
  if (failedImports.length > 0) {
    issues.push({
      id: 'imp',
      type: 'warning',
      icon: AlertTriangle,
      title: `${failedImports.length} Failed Imports`,
      desc: 'Catalog datasets failed to parse',
    });
  }

  const failedCampaigns = campaigns?.filter(c => c.status === 'FAILED') || [];
  if (failedCampaigns.length > 0) {
    issues.push({
      id: 'camp',
      type: 'warning',
      icon: AlertTriangle,
      title: `${failedCampaigns.length} Failed Campaigns`,
      desc: 'Search campaigns halted',
    });
  }

  const criticalSec = security?.filter(s => s.severity === 'CRITICAL' || s.severity === 'WARNING') || [];
  if (criticalSec.length > 0) {
    issues.push({
      id: 'sec',
      type: 'warning',
      icon: ShieldAlert,
      title: `${criticalSec.length} Security Alerts`,
      desc: 'Suspicious activities logged',
    });
  }

  return (
    <section className="flex flex-col rounded-[24px] border border-black/[0.04] bg-[#FAFAF9] shadow-inner h-full">
      <div className="px-6 py-5 border-b border-black/[0.03]">
        <h3 className="text-[15px] font-bold tracking-tight text-black flex items-center gap-2">
          Needs Attention
          {issues.length > 0 && (
             <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700">{issues.length}</span>
          )}
        </h3>
        <p className="text-[12px] font-semibold text-secondary mt-0.5">Priority operational risks</p>
      </div>
      <div className="p-6 flex-1 flex flex-col gap-3">
        {issues.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 mb-3">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-[14px] font-bold text-black">Everything looks stable</p>
            <p className="text-[12px] text-secondary mt-1">No active issues detected</p>
          </div>
        ) : (
          issues.map(issue => {
            const Icon = issue.icon;
            const isCrit = issue.type === 'critical';
            return (
              <div key={issue.id} className={`flex items-start gap-3 rounded-[16px] p-4 border ${isCrit ? 'bg-red-50/50 border-red-100' : 'bg-orange-50/50 border-orange-100'}`}>
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isCrit ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                  <Icon size={16} strokeWidth={2.5} />
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${isCrit ? 'text-red-900' : 'text-orange-900'}`}>{issue.title}</p>
                  <p className={`text-[11px] font-semibold mt-0.5 ${isCrit ? 'text-red-700/80' : 'text-orange-800/70'}`}>{issue.desc}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

/* ============================================================== */
/*  COMPACT CARDS (Bottom Row)                                     */
/* ============================================================== */
const CompactCard = ({ title, icon: Icon, children }) => (
  <div className="rounded-[20px] border border-black/[0.04] bg-white shadow-sm flex flex-col h-[280px]">
    <div className="px-5 py-4 border-b border-black/[0.03] flex items-center gap-2">
      <Icon size={16} className="text-black/40" />
      <h3 className="text-[13px] font-bold tracking-tight text-black">{title}</h3>
    </div>
    <div className="p-4 flex-1 overflow-hidden flex flex-col">
      {children}
    </div>
  </div>
);

/* ============================================================== */
/*  MAIN OVERVIEW PANEL                                            */
/* ============================================================== */
const AdminOverviewPanel = ({ totals = {}, systemStatus, security = [], _catalog, imports = [], errors = [], campaigns = [] }) => {
  const recentImports = imports.slice(0, 4);
  const recentErrors = errors.slice(0, 4);
  const recentSecurity = security.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* ---- Top Command Strip: 4 Main Metrics ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Users" 
          value={totals.totalUsers} 
          icon={Users} 
          context={`${totals.verifiedUsers} verified accounts`}
          accent 
        />
        <StatCard 
          label="Lead Records" 
          value={totals.totalCatalogLeads} 
          icon={Database} 
          context="Available in data index"
        />
        <StatCard 
          label="Campaigns" 
          value={totals.totalCampaigns} 
          icon={Rocket} 
          context={`${campaigns.filter(c => c.status === 'COMPLETED').length} completed`}
        />
        <StatCard 
          label="Import Batches" 
          value={totals.totalDatasetImports} 
          icon={FolderInput} 
          context={`${imports.reduce((acc, i) => acc + (i.importedRows || 0), 0)} rows processed`}
        />
      </div>

      {/* ---- Middle Tier: Platform Pulse & Risk Rail ---- */}
      <div className="grid gap-6 xl:grid-cols-[2fr_1.2fr]">
        <PlatformPulseCard systemStatus={systemStatus} />
        <NeedsAttentionCard errors={errors} imports={imports} campaigns={campaigns} security={security} />
      </div>

      {/* ---- Bottom Tier: Compact Event Streams ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CompactCard title="Recent Activity" icon={Activity}>
          <div className="flex-1 flex flex-col gap-1">
            {recentSecurity.length > 0 ? recentSecurity.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-black/[0.02] transition-colors">
                <div className="min-w-0 pr-3">
                  <p className="text-[12px] font-bold text-black/80 truncate">{actionLabel(evt.action)}</p>
                  <p className="text-[10px] font-semibold text-secondary truncate mt-0.5">{evt.user?.email || 'System'}</p>
                </div>
                <span className="text-[10px] font-bold text-black/30 shrink-0">
                  {new Date(evt.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )) : <div className="m-auto text-[11px] font-semibold text-secondary">No recent activity</div>}
          </div>
        </CompactCard>

        <CompactCard title="Import Pipeline" icon={FileUp}>
          <div className="flex-1 flex flex-col gap-1">
            {recentImports.length > 0 ? recentImports.map((imp) => {
              const total = (imp.importedRows || 0) + (imp.duplicateRows || 0) + (imp.errorRows || 0);
              const progress = total > 0 ? Math.round(((imp.importedRows || 0) / total) * 100) : 0;
              return (
                <div key={imp.id} className="flex flex-col justify-center p-2 rounded-xl hover:bg-black/[0.02] transition-colors gap-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-bold text-black/80 truncate pr-2">Batch {imp.id.slice(-6).toUpperCase()}</p>
                    <span className="text-[10px] font-bold text-black/40">{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-black rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            }) : <div className="m-auto text-[11px] font-semibold text-secondary">No active imports</div>}
          </div>
        </CompactCard>

        <CompactCard title="Security & Errors" icon={ShieldAlert}>
          <div className="flex-1 flex flex-col gap-1">
            {recentErrors.length > 0 ? recentErrors.map((err) => (
              <div key={err.id} className="flex items-start justify-between p-2 rounded-xl hover:bg-black/[0.02] transition-colors gap-3">
                <div className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Bug size={10} strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-black/80 truncate">{err.errorCode}</p>
                  <p className="text-[10px] font-semibold text-secondary truncate mt-0.5">{err.message}</p>
                </div>
              </div>
            )) : <div className="m-auto text-[11px] font-semibold text-secondary">No recent errors</div>}
          </div>
        </CompactCard>
      </div>

    </div>
  );
};

export default AdminOverviewPanel;
