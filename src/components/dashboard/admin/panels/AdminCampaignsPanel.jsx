import AdminDataTable, { StatusPill } from '../AdminDataTable';
import { fullDate, sourceLabel, campaignStatusStyle } from '../admin.utils';

const AdminCampaignsPanel = ({ campaigns = [] }) => {
  const columns = [
    {
      key: 'name', label: 'Campaign',
      render: (r) => <span className="font-bold text-black">{r.name || '—'}</span>,
    },
    {
      key: 'owner', label: 'Owner',
      render: (r) => <span className="text-[12px] text-secondary">{r.user?.email || '—'}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <StatusPill label={r.status} className={campaignStatusStyle(r.status)} />,
    },
    {
      key: 'source', label: 'Source',
      render: (r) => {
        const src = r.latestResultSet?.sourceUsed || r.sources?.[0];
        return <span className="text-[12px] font-semibold text-secondary">{sourceLabel(src)}</span>;
      },
    },
    {
      key: 'resultCount', label: 'Results',
      render: (r) => <span className="font-bold tabular-nums">{r.resultCount ?? 0}</span>,
    },
    {
      key: 'creditsUsed', label: 'Credits',
      render: (r) => <span className="tabular-nums text-secondary font-semibold">{r.creditsUsed ?? 0}</span>,
    },
    {
      key: 'createdAt', label: 'Started',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.createdAt)}</span>,
      align: 'right',
    },
  ];

  return (
    <AdminDataTable
      title="Search Campaigns"
      description={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
      columns={columns}
      rows={campaigns}
      emptyTitle="No campaigns yet"
      emptyDesc="Campaigns will appear here once users start searching."
    />
  );
};

export default AdminCampaignsPanel;
