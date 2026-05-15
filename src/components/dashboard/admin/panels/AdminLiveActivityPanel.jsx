import { useState, useCallback, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import AdminDataTable, { StatusPill, CopyId } from '../AdminDataTable';
import { fullDate, severityStyle } from '../admin.utils';
import { apiRequest } from '../../../../lib/api';

const AdminLiveActivityPanel = ({ onSelect }) => {
  const [data, setData] = useState({ logs: [], loading: true });
  const [filters, setFilters] = useState({ search: '', category: '', severity: '' });

  const fetchLogs = useCallback(async (f) => {
    try {
      const q = new URLSearchParams({ limit: '100' });
      if (f.search) q.set('search', f.search);
      if (f.category) q.set('category', f.category);
      if (f.severity) q.set('severity', f.severity);
      const res = await apiRequest(`/api/admin/activity?${q}`);
      return res.data.activity || [];
    } catch {
      return [];
    }
  }, []);

  const refresh = useCallback(async (f) => {
    setData((d) => ({ ...d, loading: true }));
    const logs = await fetchLogs(f);
    setData({ logs, loading: false });
  }, [fetchLogs]);

  useEffect(() => {
    let active = true;
    fetchLogs(filters).then((logs) => { if (active) setData({ logs, loading: false }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.severity, fetchLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    refresh(filters);
  };

  const columns = [
    {
      key: 'severity', label: 'Level',
      render: (r) => <StatusPill label={r.severity} className={severityStyle(r.severity)} />,
    },
    {
      key: 'title', label: 'Event',
      render: (r) => (
        <div>
          <p className="font-bold text-black text-sm">{(r.title || '').replace(/_/g, ' ')}</p>
          <p className="text-[11px] text-secondary mt-0.5">{r.category}</p>
        </div>
      ),
    },
    {
      key: 'actor', label: 'Actor',
      render: (r) => (
        <div>
          <p className="text-[12px] font-semibold text-black/70">{r.actorEmail || 'System'}</p>
          {r.requestId && <CopyId value={r.requestId} />}
        </div>
      ),
    },
    {
      key: 'context', label: 'Context',
      render: (r) => (
        <span className="text-[12px] text-secondary truncate block max-w-[220px]" title={r.description || r.route || ''}>
          {r.description || r.route || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt', label: 'Time',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.createdAt)}</span>,
      align: 'right',
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={handleSearch} className="relative flex-1 min-w-[180px] flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            type="text"
            placeholder="Search events…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="h-9 w-full rounded-xl border border-black/[0.08] bg-[#FAFAF9] pl-8 pr-3 text-sm font-semibold text-black outline-none transition-colors focus:border-black/20 focus:bg-white"
            aria-label="Search activity events"
          />
        </div>
        <button type="submit" className="h-9 rounded-xl bg-black px-4 text-sm font-bold text-white hover:bg-black/80 transition-colors">Search</button>
      </form>
      <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} aria-label="Filter by category" className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none">
        <option value="">All Categories</option>
        <option value="auth">Auth</option>
        <option value="security">Security</option>
        <option value="error">Errors</option>
        <option value="search">Search</option>
        <option value="lead_list">Lead Lists</option>
        <option value="import">Imports</option>
        <option value="admin">Admin</option>
        <option value="system">System</option>
      </select>
      <select value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))} aria-label="Filter by severity" className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none">
        <option value="">All Levels</option>
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="critical">Critical</option>
      </select>
      <button type="button" onClick={() => refresh(filters)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-black/50 hover:bg-black/5 hover:text-black transition-colors" aria-label="Refresh activity">
        <RefreshCw size={14} />
      </button>
    </div>
  );

  return (
    <AdminDataTable
      title="Live Activity"
      description="Real-time system and user events."
      columns={columns}
      rows={data.logs}
      loading={data.loading}
      toolbar={toolbar}
      onRowClick={onSelect}
      emptyTitle="No activity found"
      emptyDesc="Adjust your filters or wait for new events."
      minWidth="820px"
    />
  );
};

export default AdminLiveActivityPanel;
