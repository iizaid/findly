import { useState, useEffect, useMemo } from 'react';
import { Search, Database } from 'lucide-react';
import AdminDataTable, { ContactChips } from '../AdminDataTable';
import { fullDate, sourceLabel, fmt } from '../admin.utils';
import { apiRequest } from '../../../../lib/api';

const AdminCatalogPanel = ({ catalog }) => {
  const [data, setData] = useState({ leads: [], loading: true });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [govFilter, setGovFilter] = useState('');

  const loadLeads = async (q = '', cat = '', gov = '') => {
    setData((d) => ({ ...d, loading: true }));
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (q) params.set('search', q);
      if (cat) params.set('category', cat);
      if (gov) params.set('governorate', gov);
      const res = await apiRequest(`/api/admin/catalog/leads?${params}`);
      setData({ leads: res.data.leads || [], loading: false });
    } catch {
      setData({ leads: [], loading: false });
    }
  };

  useEffect(() => {
    let active = true;
    apiRequest('/api/admin/catalog/leads?limit=25')
      .then((res) => { if (active) setData({ leads: res.data.leads || [], loading: false }); })
      .catch(() => { if (active) setData({ leads: [], loading: false }); });
    return () => { active = false; };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadLeads(search, categoryFilter, govFilter);
  };

  const categories = useMemo(() => (catalog?.byCategory || []).slice(0, 20), [catalog]);
  const governorates = useMemo(() => (catalog?.byGovernorate || []).slice(0, 15), [catalog]);

  const columns = [
    {
      key: 'businessName', label: 'Business',
      render: (r) => <span className="font-bold text-black">{r.businessName || '—'}</span>,
    },
    {
      key: 'category', label: 'Category',
      render: (r) => <span className="text-[12px] text-secondary">{r.category || '—'}</span>,
    },
    {
      key: 'city', label: 'Location',
      render: (r) => <span className="text-[12px] text-secondary">{r.city || '—'}</span>,
    },
    {
      key: 'source', label: 'Source',
      render: (r) => <span className="text-[12px] font-semibold text-secondary">{sourceLabel(r.source)}</span>,
    },
    {
      key: 'contact', label: 'Channels',
      render: (r) => <ContactChips row={r} />,
    },
    {
      key: 'importedAt', label: 'Imported',
      render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.importedAt)}</span>,
      align: 'right',
    },
  ];

  /* ---- Quick Stats ---- */
  const stats = catalog ? (
    <div className="grid gap-3 sm:grid-cols-3 mb-5">
      <div className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Total Records</p>
        <p className="mt-1 text-xl font-bold tracking-tight">{fmt(catalog.total)}</p>
      </div>
      <div className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Top Category</p>
        <p className="mt-1 text-xl font-bold tracking-tight">{catalog.byCategory?.[0]?.category || '—'}</p>
        <p className="text-[11px] text-secondary">{fmt(catalog.byCategory?.[0]?.count)} records</p>
      </div>
      <div className="rounded-[18px] border border-black/[0.04] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Top Location</p>
        <p className="mt-1 text-xl font-bold tracking-tight">{catalog.byGovernorate?.[0]?.governorate || '—'}</p>
        <p className="text-[11px] text-secondary">{fmt(catalog.byGovernorate?.[0]?.count)} records</p>
      </div>
    </div>
  ) : null;

  const toolbar = (
    <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
        <input
          type="text"
          placeholder="Search catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-xl border border-black/[0.08] bg-[#FAFAF9] pl-8 pr-3 text-sm font-semibold text-black outline-none transition-colors focus:border-black/20 focus:bg-white"
        />
      </div>
      {categories.length > 0 && (
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.category} value={c.category}>{c.category} ({c.count})</option>)}
        </select>
      )}
      {governorates.length > 0 && (
        <select value={govFilter} onChange={(e) => setGovFilter(e.target.value)} className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none">
          <option value="">All Locations</option>
          {governorates.map((g) => <option key={g.governorate} value={g.governorate}>{g.governorate} ({g.count})</option>)}
        </select>
      )}
      <button type="submit" className="h-9 rounded-xl bg-black px-4 text-sm font-bold text-white hover:bg-black/80 transition-colors">Search</button>
    </form>
  );

  return (
    <div className="space-y-0">
      {stats}
      <AdminDataTable
        title="Data Catalog"
        description="Global indexed records available for search."
        columns={columns}
        rows={data.leads}
        loading={data.loading}
        toolbar={toolbar}
        emptyTitle="No records found"
        emptyDesc="Try adjusting your search or filters."
      />
    </div>
  );
};

export default AdminCatalogPanel;
