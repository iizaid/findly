import AdminDataTable, { StatusPill, CopyId } from '../AdminDataTable';
import { fullDate, httpStatusStyle } from '../admin.utils';

const AdminErrorsPanel = ({ errors = [] }) => {
  const columns = [
    {
      key: 'statusCode', label: 'Status',
      render: (r) => <StatusPill label={String(r.statusCode || '—')} className={httpStatusStyle(r.statusCode)} />,
    },
    {
      key: 'errorCode', label: 'Code',
      render: (r) => <span className="font-mono text-[12px] font-bold text-black/70">{r.errorCode || '—'}</span>,
    },
    {
      key: 'route', label: 'Route',
      render: (r) => (
        <div className="max-w-[200px]">
          <span className="text-[11px] font-bold text-secondary">{r.method || ''}</span>{' '}
          <span className="text-[12px] font-semibold text-black/70 truncate block">{r.route || '—'}</span>
        </div>
      ),
    },
    {
      key: 'message', label: 'Message',
      render: (r) => <span className="text-[12px] text-secondary truncate block max-w-[260px]" title={r.message}>{r.message || '—'}</span>,
    },
    {
      key: 'requestId', label: 'Request ID',
      render: (r) => <CopyId value={r.requestId} />,
    },
    {
      key: 'user', label: 'User',
      render: (r) => <span className="text-[12px] text-secondary">{r.user?.email || '—'}</span>,
    },
    {
      key: 'createdAt', label: 'Time',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.createdAt)}</span>,
      align: 'right',
    },
  ];

  return (
    <AdminDataTable
      title="Error Monitor"
      description="Tracked backend errors and failures."
      columns={columns}
      rows={errors}
      emptyTitle="No errors recorded"
      emptyDesc="Backend is running cleanly."
      minWidth="950px"
    />
  );
};

export default AdminErrorsPanel;
