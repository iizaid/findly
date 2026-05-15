import AdminDataTable, { StatusPill } from '../AdminDataTable';
import { fullDate, importStatusStyle, fmt } from '../admin.utils';

const AdminImportsPanel = ({ imports = [], onSelect }) => {
  const columns = [
    {
      key: 'fileName', label: 'File',
      render: (r) => (
        <div>
          <p className="font-bold text-black text-sm truncate max-w-[200px]">{r.fileName || '—'}</p>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <StatusPill label={r.status} className={importStatusStyle(r.status)} />,
    },
    {
      key: 'totalRows', label: 'Total',
      render: (r) => <span className="font-bold tabular-nums">{fmt(r.totalRows)}</span>,
    },
    {
      key: 'importedRows', label: 'Imported',
      render: (r) => <span className="font-bold tabular-nums text-emerald-700">{fmt(r.importedRows)}</span>,
    },
    {
      key: 'duplicateRows', label: 'Dupes',
      render: (r) => <span className="tabular-nums text-secondary">{fmt(r.duplicateRows)}</span>,
    },
    {
      key: 'errorRows', label: 'Errors',
      render: (r) => (
        <span className={`tabular-nums font-semibold ${r.errorRows > 0 ? 'text-red-600' : 'text-secondary'}`}>
          {fmt(r.errorRows)}
        </span>
      ),
    },
    {
      key: 'progress', label: 'Coverage',
      render: (r) => {
        if (!r.totalRows) return <span className="text-secondary">—</span>;
        const pct = Math.round(((r.importedRows || 0) / r.totalRows) * 100);
        return (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="h-1.5 flex-1 rounded-full bg-black/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${r.status === 'FAILED' ? 'bg-red-400' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] font-bold tabular-nums text-secondary w-8 text-right">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: 'completedAt', label: 'Completed',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.completedAt || r.failedAt)}</span>,
      align: 'right',
    },
  ];

  return (
    <AdminDataTable
      title="Dataset Imports"
      description={`${imports.length} import${imports.length !== 1 ? 's' : ''}`}
      columns={columns}
      rows={imports}
      onRowClick={onSelect}
      emptyTitle="No imports yet"
      emptyDesc="Import records will appear after using Bulk Import."
      minWidth="900px"
    />
  );
};

export default AdminImportsPanel;
