import AdminDataTable, { StatusPill } from '../AdminDataTable';
import { fullDate, actionLabel, severityStyle } from '../admin.utils';

const AdminSecurityPanel = ({ events = [] }) => {
  const columns = [
    {
      key: 'action', label: 'Event',
      render: (r) => (
        <div>
          <p className="font-bold text-black text-sm">{actionLabel(r.action)}</p>
          {r.entityType && <p className="text-[11px] text-secondary">{r.entityType}</p>}
        </div>
      ),
    },
    {
      key: 'severity', label: 'Severity',
      render: (r) => {
        const sev = r.action?.includes('FAILED') || r.action?.includes('DENIED') ? 'warning' : 'info';
        return <StatusPill label={sev} className={severityStyle(sev)} />;
      },
    },
    {
      key: 'user', label: 'Actor',
      render: (r) => <span className="text-[12px] text-secondary">{r.user?.email || 'System'}</span>,
    },
    {
      key: 'ipAddress', label: 'IP',
      render: (r) => <span className="text-[12px] font-mono text-secondary">{r.ipAddress || '—'}</span>,
    },
    {
      key: 'createdAt', label: 'Time',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.createdAt)}</span>,
      align: 'right',
    },
  ];

  return (
    <AdminDataTable
      title="Security Monitor"
      description="Recent authentication, access, and session events."
      columns={columns}
      rows={events}
      emptyTitle="All clear"
      emptyDesc="No security events to report."
    />
  );
};

export default AdminSecurityPanel;
