import { useState } from 'react';
import { X, Copy, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { fullDate, actionLabel, sourceLabel, campaignStatusStyle, importStatusStyle, severityStyle } from './admin.utils';

/**
 * Premium right-side contextual detail panel for selected records.
 * Shows clean human-readable fields with technical details collapsed.
 */
const AdminDetailPanel = ({ record, type, onClose }) => {
  if (!record) return null;

  const renderContent = () => {
    switch (type) {
      case 'user': return <UserDetail r={record} />;
      case 'campaign': return <CampaignDetail r={record} />;
      case 'import': return <ImportDetail r={record} />;
      case 'security': return <SecurityDetail r={record} />;
      case 'error': return <ErrorDetail r={record} />;
      case 'activity': return <ActivityDetail r={record} />;
      case 'catalog': return <CatalogDetail r={record} />;
      default: return <GenericDetail r={record} />;
    }
  };

  return (
    <aside className="rounded-[24px] border border-black/[0.04] bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Record Details</p>
          <p className="text-[15px] font-bold text-black mt-1 truncate">{getTitle(record, type)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-black/40 hover:bg-black/5 hover:text-black transition-colors ml-3"
          aria-label="Close detail panel"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* Status banner */}
      {getStatusBanner(record, type)}

      {/* Panel body */}
      <div className="p-6 space-y-1 max-h-[65vh] overflow-y-auto">
        {renderContent()}
      </div>
    </aside>
  );
};

/* ---- Helpers ---- */
const getTitle = (r, type) => {
  if (type === 'user') return r.name || r.email || 'User';
  if (type === 'campaign') return r.name || 'Campaign';
  if (type === 'import') {
    if (!r.fileName) return 'Import Batch';
    if (/^[0-9a-fA-F-]{20,}/.test(r.fileName)) return 'Import Batch';
    return r.fileName;
  }
  if (type === 'security') return actionLabel(r.action);
  if (type === 'error') return `${r.method || ''} ${r.route || ''}`.trim() || 'Error';
  if (type === 'catalog') return r.businessName || 'Record';
  if (type === 'activity') return (r.title || '').replace(/_/g, ' ');
  return 'Details';
};

const getStatusBanner = (r, type) => {
  let label = null;
  let bg = '';
  
  if (type === 'campaign') {
    const s = campaignStatusStyle(r.status);
    label = r.status;
    bg = s.bg;
  } else if (type === 'import') {
    const s = importStatusStyle(r.status);
    label = r.status;
    bg = s.bg;
  } else if (type === 'error') {
    const is5xx = r.statusCode >= 500;
    label = is5xx ? `${r.statusCode} Server Error` : `${r.statusCode} Client Error`;
    bg = is5xx ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  }

  if (!label) return null;
  return (
    <div className={`px-6 py-3 border-b border-black/[0.03] ${bg}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
};

const Pill = ({ label, className }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${className}`}>
    {label}
  </span>
);

const Row = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 py-2.5 border-b border-black/[0.03] last:border-0">
    <span className="text-[11px] font-bold uppercase tracking-wider text-secondary shrink-0 mt-0.5">{label}</span>
    <span className={`text-[13px] font-semibold text-black/80 text-right break-all ${mono ? 'font-mono text-[12px]' : ''}`}>{children || '—'}</span>
  </div>
);

const CopyField = ({ value }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[12px] text-secondary">—</span>;
  const handleCopy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1.5 text-[12px] font-mono text-black/50 hover:text-black transition-colors">
      {copied ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}
      <span className="truncate max-w-[180px]">{value}</span>
    </button>
  );
};

const TechnicalSection = ({ data }) => {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  return (
    <div className="mt-3 rounded-[16px] bg-[#FAFAF9] border border-black/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02] transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Technical Details</span>
        {open ? <ChevronUp size={14} className="text-black/30" /> : <ChevronDown size={14} className="text-black/30" />}
      </button>
      {open && (
        <div className="px-4 pb-3">
          <pre className="text-[11px] text-black/50 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
            {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/* ---- Type-specific details ---- */
const UserDetail = ({ r }) => (
  <>
    <Row label="Name">{r.name}</Row>
    <Row label="Email">{r.email}</Row>
    <Row label="Role"><Pill label={r.role} className={r.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.05] text-black/60'} /></Row>
    <Row label="Status"><Pill label={r.emailVerified ? 'Verified' : 'Pending'} className={r.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} /></Row>
    <Row label="Credits"><span className="tabular-nums">{r.creditsBalance ?? 0}</span></Row>
    <Row label="Plan">{r.plan || 'FREE'}</Row>
    <Row label="Joined">{fullDate(r.createdAt)}</Row>
    {r.lastLoginAt && <Row label="Last Login">{fullDate(r.lastLoginAt)}</Row>}
    <Row label="ID"><CopyField value={r.id} /></Row>
  </>
);

const CampaignDetail = ({ r }) => (
  <>
    <Row label="Campaign">{r.name}</Row>
    <Row label="Owner">{r.user?.email}</Row>
    <Row label="Query">{r.query}</Row>
    {r.city && <Row label="Location">{r.city}, {r.country}</Row>}
    <Row label="Platforms">{(r.sources || []).map(s => sourceLabel(s)).join(', ') || 'Auto'}</Row>
    <Row label="Results"><span className="tabular-nums font-bold">{r.resultCount ?? 0}</span></Row>
    <Row label="Credits"><span className="tabular-nums">{r.creditsUsed ?? 0}</span></Row>
    <Row label="Created">{fullDate(r.createdAt)}</Row>
    {r.completedAt && <Row label="Completed">{fullDate(r.completedAt)}</Row>}
    {r.error && <Row label="Error"><span className="text-red-600">{r.error}</span></Row>}
    <Row label="ID"><CopyField value={r.id} /></Row>
  </>
);

const ImportDetail = ({ r }) => {
  const total = (r.importedRows || 0) + (r.duplicateRows || 0) + (r.errorRows || 0);
  const progress = total > 0 ? Math.round(((r.importedRows || 0) / total) * 100) : 0;

  return (
    <>
      <Row label="Status"><Pill label={importStatusStyle(r.status).label} className={importStatusStyle(r.status).bg} /></Row>
      {/* Progress bar */}
      <div className="py-3 border-b border-black/[0.03]">
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Success Rate</span>
          <span className="text-[12px] font-bold text-black">{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-black/[0.04] overflow-hidden">
          <div className={`h-full rounded-full ${r.status === 'FAILED' ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <Row label="Imported"><span className="tabular-nums text-emerald-700 font-bold">{r.importedRows ?? 0}</span></Row>
      <Row label="Duplicates"><span className="tabular-nums">{r.duplicateRows ?? 0}</span></Row>
      <Row label="Errors"><span className={`tabular-nums ${r.errorRows > 0 ? 'text-red-600 font-bold' : ''}`}>{r.errorRows ?? 0}</span></Row>
      {r.errorMessage && <Row label="Message"><span className="text-red-600 text-[12px]">{r.errorMessage}</span></Row>}
      <Row label="Started">{fullDate(r.startedAt)}</Row>
      <Row label="Finished">{fullDate(r.completedAt || r.failedAt)}</Row>
      {/* Technical: file key */}
      <Row label="File Key"><CopyField value={r.fileName} /></Row>
      <Row label="ID"><CopyField value={r.id} /></Row>
    </>
  );
};

const SecurityDetail = ({ r }) => (
  <>
    <Row label="Action">{actionLabel(r.action)}</Row>
    <Row label="Actor">{r.user?.email || 'System'}</Row>
    <Row label="IP Address" mono>{r.ipAddress}</Row>
    {r.userAgent && <Row label="User Agent"><span className="text-[11px] break-all">{r.userAgent.slice(0, 120)}</span></Row>}
    {r.entityType && <Row label="Entity">{r.entityType}</Row>}
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    <Row label="ID"><CopyField value={r.id} /></Row>
    <TechnicalSection data={r.metadata} />
  </>
);

const ErrorDetail = ({ r }) => (
  <>
    <Row label="Error Code" mono>{r.errorCode}</Row>
    <Row label="Route" mono>{r.method} {r.route}</Row>
    <Row label="Message">{r.message}</Row>
    <Row label="User">{r.user?.email}</Row>
    <Row label="IP" mono>{r.ipAddress}</Row>
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    <Row label="Request ID"><CopyField value={r.requestId} /></Row>
  </>
);

const ActivityDetail = ({ r }) => (
  <>
    <Row label="Event">{(r.title || '').replace(/_/g, ' ')}</Row>
    <Row label="Severity"><Pill label={severityStyle(r.severity).label} className={severityStyle(r.severity).bg} /></Row>
    <Row label="Category">{r.category}</Row>
    <Row label="Actor">{r.actorEmail || 'System'}</Row>
    <Row label="Context">{r.description || r.route}</Row>
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    {r.requestId && <Row label="Request ID"><CopyField value={r.requestId} /></Row>}
    <TechnicalSection data={r.metadataSummary} />
  </>
);

const CatalogDetail = ({ r }) => (
  <>
    <Row label="Business">{r.businessName}</Row>
    <Row label="Category">{r.category}</Row>
    <Row label="Location">{[r.city, r.country].filter(Boolean).join(', ')}</Row>
    <Row label="Source">{sourceLabel(r.source)}</Row>
    {r.websiteUrl && <Row label="Website" mono>{r.websiteUrl}</Row>}
    {r.instagramUrl && <Row label="Instagram" mono>{r.instagramUrl}</Row>}
    {r.instagramUsername && <Row label="IG Handle">@{r.instagramUsername}</Row>}
    {r.phone && <Row label="Phone">{r.phone}</Row>}
    {r.whatsappNumber && <Row label="WhatsApp">{r.whatsappNumber}</Row>}
    {r.googleMapsUrl && <Row label="Maps" mono>{r.googleMapsUrl}</Row>}
    {r.email && <Row label="Email">{r.email}</Row>}
    <Row label="Added">{fullDate(r.importedAt || r.createdAt)}</Row>
    <Row label="ID"><CopyField value={r.id} /></Row>
  </>
);

const GenericDetail = ({ r }) => (
  <>
    {Object.entries(r).filter(([k]) => !['id', 'rawData'].includes(k)).slice(0, 12).map(([k, v]) => (
      <Row key={k} label={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</Row>
    ))}
    {r.id && <Row label="ID"><CopyField value={r.id} /></Row>}
  </>
);

export default AdminDetailPanel;
