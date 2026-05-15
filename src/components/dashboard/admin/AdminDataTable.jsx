import { copyToClipboard } from './admin.utils';

/**
 * Reusable premium data table for all admin panels.
 *
 * Props:
 *  title        — optional heading
 *  description  — optional subtitle
 *  columns      — [{ key, label, render?, align?, width?, className? }]
 *  rows         — data array
 *  loading      — shows skeleton
 *  emptyTitle   — empty-state heading
 *  emptyDesc    — empty-state description
 *  toolbar      — optional ReactNode rendered above the table
 *  onRowClick   — optional (row) => void
 *  stickyHeader — default true
 *  minWidth     — default '720px'
 */
const AdminDataTable = ({
  title,
  description,
  columns = [],
  rows = [],
  loading = false,
  emptyTitle = 'No records found',
  emptyDesc = 'Data will appear here once available.',
  toolbar,
  onRowClick,
  stickyHeader = true,
  minWidth = '720px',
}) => {
  /* ---------- skeleton rows ---------- */
  const skeletonRows = Array.from({ length: 5 }, (_, i) => (
    <tr key={`skel-${i}`} className="border-b border-black/[0.04]">
      {columns.map((col) => (
        <td key={col.key} className="py-3.5 px-5">
          <div className="h-3.5 w-2/3 animate-pulse rounded-md bg-black/[0.06]" />
        </td>
      ))}
    </tr>
  ));

  return (
    <section className="rounded-[22px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
      {/* header */}
      {(title || toolbar) && (
        <div className="px-6 pt-6 pb-4 border-b border-black/[0.04]">
          {title && (
            <div className="mb-4">
              <h3 className="text-lg font-bold tracking-tight text-black">{title}</h3>
              {description && <p className="mt-1 text-xs font-semibold text-secondary">{description}</p>}
            </div>
          )}
          {toolbar}
        </div>
      )}

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className={`text-[10px] font-bold uppercase tracking-[0.14em] text-secondary bg-[#FAFAF9] ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr className="border-b border-black/[0.06]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-5 whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''} ${col.width ? col.width : ''} ${col.className || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {loading ? (
              skeletonRows
            ) : rows.length > 0 ? (
              rows.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className={`transition-colors hover:bg-black/[0.015] ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3.5 px-5 font-medium text-black/80 ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : (row[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-accent" />
                  <p className="text-base font-bold tracking-tight text-black">{emptyTitle}</p>
                  <p className="mt-1.5 text-xs font-semibold text-secondary max-w-sm mx-auto">{emptyDesc}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/* ---------- small composable pieces ---------- */

export const StatusPill = ({ label, className = '' }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-tight ${className}`}>
    {label}
  </span>
);

export const CopyId = ({ value }) => {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); copyToClipboard(value); }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:text-black transition-colors"
      title="Copy to clipboard"
    >
      <span className="font-mono">{value.slice(0, 8)}…</span>
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm8 0H6v8h6V2zM2 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1H8v1H2V6h1V4H2z"/></svg>
    </button>
  );
};

export const ContactChips = ({ row }) => {
  const chips = [];
  if (row.websiteUrl) chips.push('Web');
  if (row.instagramUrl || row.instagramUsername) chips.push('IG');
  if (row.phone) chips.push('Phone');
  if (row.whatsappNumber) chips.push('WA');
  if (row.googleMapsUrl) chips.push('Maps');
  if (row.email) chips.push('Email');
  if (!chips.length) return <span className="text-secondary">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black/60">{c}</span>
      ))}
    </div>
  );
};

export default AdminDataTable;
