import { useState, useEffect, useMemo } from 'react';
import { Search, Database, LayoutGrid, MapPin, Loader2 } from 'lucide-react';
import { ContactChips } from '../AdminDataTable';
import { fullDate, sourceLabel, fmt } from '../admin.utils';
import { apiRequest } from '../../../../lib/api';

/* ============================================================== */
/*  CATALOG PANEL                                                  */
/* ============================================================== */
const AdminCatalogPanel = ({ catalog, onSelect }) => {
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

  return (
    <div className="space-y-6">
      {/* SUMMARY CARDS */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-black/[0.04] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black/[0.03] text-black/50">
              <Database size={18} strokeWidth={2.5} />
            </div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-secondary">Total Records</p>
          </div>
          <p className="text-[32px] font-extrabold tracking-tight text-black leading-none">
            {catalog ? fmt(catalog.total) : '—'}
          </p>
          <p className="mt-2 text-[12px] font-semibold text-secondary">Available in global index</p>
        </div>

        <div className="rounded-[24px] border border-black/[0.04] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black/[0.03] text-black/50">
              <LayoutGrid size={18} strokeWidth={2.5} />
            </div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-secondary">Top Category</p>
          </div>
          <p className="text-[24px] font-extrabold tracking-tight text-black leading-none truncate" title={catalog?.byCategory?.[0]?.category}>
            {catalog?.byCategory?.[0]?.category || '—'}
          </p>
          <p className="mt-2 text-[12px] font-semibold text-secondary">
            {catalog?.byCategory?.[0]?.count ? `${fmt(catalog.byCategory[0].count)} records` : 'No data'}
          </p>
        </div>

        <div className="rounded-[24px] border border-black/[0.04] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black/[0.03] text-black/50">
              <MapPin size={18} strokeWidth={2.5} />
            </div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-secondary">Top Location</p>
          </div>
          <p className="text-[24px] font-extrabold tracking-tight text-black leading-none truncate" title={catalog?.byGovernorate?.[0]?.governorate}>
            {catalog?.byGovernorate?.[0]?.governorate || '—'}
          </p>
          <p className="mt-2 text-[12px] font-semibold text-secondary">
            {catalog?.byGovernorate?.[0]?.count ? `${fmt(catalog.byGovernorate[0].count)} records` : 'No data'}
          </p>
        </div>
      </div>

      {/* CATALOG EXPLORER */}
      <section className="flex flex-col rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" />
              <input
                type="text"
                placeholder="Search catalog businesses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white pl-10 pr-4 text-[13px] font-semibold text-black placeholder:text-black/30 outline-none transition-colors focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </div>
            {categories.length > 0 && (
              <select 
                value={categoryFilter} 
                onChange={(e) => setCategoryFilter(e.target.value)} 
                className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 sm:max-w-[200px]"
              >
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c.category} value={c.category}>{c.category} ({fmt(c.count)})</option>)}
              </select>
            )}
            {governorates.length > 0 && (
              <select 
                value={govFilter} 
                onChange={(e) => setGovFilter(e.target.value)} 
                className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 sm:max-w-[200px]"
              >
                <option value="">All Locations</option>
                {governorates.map((g) => <option key={g.governorate} value={g.governorate}>{g.governorate} ({fmt(g.count)})</option>)}
              </select>
            )}
            <button type="submit" className="h-11 rounded-[14px] bg-black px-6 text-[13px] font-bold text-white hover:bg-black/80 transition-colors">
              Search
            </button>
          </form>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {data.loading ? (
             <div className="flex flex-col items-center justify-center py-20 text-black/30">
               <Loader2 size={28} className="animate-spin mb-4" />
               <p className="text-[14px] font-bold">Querying index...</p>
             </div>
          ) : data.leads.length > 0 ? (
            <div className="divide-y divide-black/[0.03]">
              {data.leads.map((lead) => (
                <div 
                  key={lead.id} 
                  onClick={() => onSelect?.(lead)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-[#FAFAF9] transition-colors cursor-pointer group gap-4"
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="text-[16px] font-bold text-black group-hover:text-accent transition-colors truncate">
                      {lead.businessName || 'Unnamed Business'}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {lead.category && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-bold text-black/70">
                          <LayoutGrid size={12} /> {lead.category}
                        </span>
                      )}
                      {(lead.city || lead.country) && (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-secondary">
                          <MapPin size={12} /> {lead.city ? `${lead.city}, ` : ''}{lead.country}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Contact */}
                  <div className="sm:w-[220px] shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-2">Available Channels</p>
                    <ContactChips row={lead} />
                  </div>

                  {/* Right: Meta */}
                  <div className="flex flex-col items-end shrink-0 sm:w-[150px]">
                    <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black/60 shadow-sm mb-1.5">
                      {sourceLabel(lead.source)}
                    </span>
                    <span className="text-[11px] font-semibold text-secondary">
                      Added {fullDate(lead.importedAt || lead.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/[0.02] text-black/20 mb-4">
                <Database size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">No records found</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">Try adjusting your search query or filters.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminCatalogPanel;
