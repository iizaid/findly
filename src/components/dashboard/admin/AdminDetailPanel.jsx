import { X } from 'lucide-react';
import { CopyId, StatusPill } from './AdminDataTable';
import { fullDate, actionLabel, sourceLabel, campaignStatusStyle, importStatusStyle, severityStyle, httpStatusStyle } from './admin.utils';

/**
 * Right-side contextual detail panel for selected records.
 * Slides in from the right on desktop, stacks below on mobile.
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
    <aside className="rounded-[22px] border border-black/[0.06] bg-white shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.04] bg-[#FAFAF9]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Record Details</p>
          <p className="text-sm font-bold text-black mt-0.5">{getTitle(record, type)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-black/40 hover:bg-black/5 hover:text-black transition-colors"
          aria-label="Close detail panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Panel body */}
      <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
        {renderContent()}
      </div>
    </aside>
  );
};

/* ---- Helpers ---- */
const getTitle = (r, type) => {
  if (type === 'user') return r.name || r.email || 'User';
  if (type === 'campaign') return r.name || 'Campaign';
  if (type === 'import') return r.fileName || 'Import';
  if (type === 'security') return actionLabel(r.action);
  if (type === 'error') return `${r.method || ''} ${r.route || ''}`.trim() || 'Error';
  if (type === 'catalog') return r.businessName || 'Record';
  if (type === 'activity') return (r.title || '').replace(/_/g, ' ');
  return 'Details';
};

const Row = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-black/[0.03] last:border-0">
    <span className="text-[11px] font-bold uppercase tracking-wider text-secondary shrink-0">{label}</span>
    <span className={`text-[13px] font-semibold text-black/80 text-right ${mono ? 'font-mono text-[12px]' : ''}`}>{children || '—'}</span>
  </div>
);

/* ---- Type-specific details ---- */
const UserDetail = ({ r }) => (
  <>
    <Row label="Name">{r.name}</Row>
    <Row label="Email">{r.email}</Row>
    <Row label="Role"><StatusPill label={r.role} className={r.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.05] text-black/60'} /></Row>
    <Row label="Verified"><StatusPill label={r.emailVerified ? 'Verified' : 'Pending'} className={r.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} /></Row>
    <Row label="Credits"><span className="tabular-nums">{r.creditsBalance ?? 0}</span></Row>
    <Row label="Plan">{r.plan || 'FREE'}</Row>
    <Row label="Joined">{fullDate(r.createdAt)}</Row>
    {r.lastLoginAt && <Row label="Last Login">{fullDate(r.lastLoginAt)}</Row>}
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

const CampaignDetail = ({ r }) => (
  <>
    <Row label="Campaign">{r.name}</Row>
    <Row label="Owner">{r.user?.email}</Row>
    <Row label="Status"><StatusPill label={r.status} className={campaignStatusStyle(r.status)} /></Row>
    <Row label="Source">{sourceLabel(r.latestResultSet?.sourceUsed || r.sources?.[0])}</Row>
    <Row label="Results"><span className="tabular-nums">{r.resultCount ?? 0}</span></Row>
    <Row label="Credits Used"><span className="tabular-nums">{r.creditsUsed ?? 0}</span></Row>
    <Row label="Created">{fullDate(r.createdAt)}</Row>
    {r.completedAt && <Row label="Completed">{fullDate(r.completedAt)}</Row>}
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

const ImportDetail = ({ r }) => (
  <>
    <Row label="File">{r.fileName}</Row>
    <Row label="Status"><StatusPill label={r.status} className={importStatusStyle(r.status)} /></Row>
    <Row label="Total"><span className="tabular-nums">{r.totalRows ?? 0}</span></Row>
    <Row label="Imported"><span className="tabular-nums text-emerald-700">{r.importedRows ?? 0}</span></Row>
    <Row label="Duplicates"><span className="tabular-nums">{r.duplicateRows ?? 0}</span></Row>
    <Row label="Skipped"><span className="tabular-nums">{r.skippedRows ?? 0}</span></Row>
    <Row label="Errors"><span className={`tabular-nums ${r.errorRows > 0 ? 'text-red-600' : ''}`}>{r.errorRows ?? 0}</span></Row>
    {r.errorMessage && <Row label="Error">{r.errorMessage}</Row>}
    <Row label="Started">{fullDate(r.startedAt)}</Row>
    <Row label="Completed">{fullDate(r.completedAt || r.failedAt)}</Row>
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

const SecurityDetail = ({ r }) => (
  <>
    <Row label="Action">{actionLabel(r.action)}</Row>
    <Row label="Actor">{r.user?.email || 'System'}</Row>
    <Row label="IP" mono>{r.ipAddress}</Row>
    {r.entityType && <Row label="Entity">{r.entityType}</Row>}
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

const ErrorDetail = ({ r }) => (
  <>
    <Row label="Status"><StatusPill label={String(r.statusCode || '—')} className={httpStatusStyle(r.statusCode)} /></Row>
    <Row label="Code" mono>{r.errorCode}</Row>
    <Row label="Route" mono>{r.method} {r.route}</Row>
    <Row label="Message">{r.message}</Row>
    <Row label="User">{r.user?.email}</Row>
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    {r.requestId && <Row label="Request ID"><CopyId value={r.requestId} /></Row>}
  </>
);

const ActivityDetail = ({ r }) => (
  <>
    <Row label="Event">{(r.title || '').replace(/_/g, ' ')}</Row>
    <Row label="Severity"><StatusPill label={r.severity} className={severityStyle(r.severity)} /></Row>
    <Row label="Category">{r.category}</Row>
    <Row label="Actor">{r.actorEmail || 'System'}</Row>
    <Row label="Context">{r.description || r.route}</Row>
    <Row label="Time">{fullDate(r.createdAt)}</Row>
    {r.requestId && <Row label="Request ID"><CopyId value={r.requestId} /></Row>}
    {r.metadataSummary && (
      <div className="mt-2 rounded-xl bg-[#FAFAF9] p-3 border border-black/[0.04]">
        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">Metadata</p>
        <pre className="text-[11px] text-black/60 font-mono whitespace-pre-wrap break-all leading-relaxed max-h-32 overflow-y-auto">
          {JSON.stringify(r.metadataSummary, null, 2)}
        </pre>
      </div>
    )}
  </>
);

const CatalogDetail = ({ r }) => (
  <>
    <Row label="Business">{r.businessName}</Row>
    <Row label="Category">{r.category}</Row>
    <Row label="Location">{r.city}</Row>
    <Row label="Source">{sourceLabel(r.source)}</Row>
    {r.websiteUrl && <Row label="Website" mono>{r.websiteUrl}</Row>}
    {r.instagramUrl && <Row label="Instagram" mono>{r.instagramUrl}</Row>}
    {r.phone && <Row label="Phone">{r.phone}</Row>}
    {r.whatsappNumber && <Row label="WhatsApp">{r.whatsappNumber}</Row>}
    {r.googleMapsUrl && <Row label="Maps" mono>{r.googleMapsUrl}</Row>}
    {r.email && <Row label="Email">{r.email}</Row>}
    <Row label="Imported">{fullDate(r.importedAt)}</Row>
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

const GenericDetail = ({ r }) => (
  <>
    {Object.entries(r).filter(([k]) => !['id', 'rawData'].includes(k)).slice(0, 12).map(([k, v]) => (
      <Row key={k} label={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</Row>
    ))}
    {r.id && <Row label="ID"><CopyId value={r.id} /></Row>}
  </>
);

export default AdminDetailPanel;
