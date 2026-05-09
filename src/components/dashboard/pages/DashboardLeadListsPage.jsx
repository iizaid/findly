import { useState, useEffect, useMemo } from 'react';
import { Plus, Table2, Loader2, Link2, AlertCircle, Search, ArrowUpDown, ExternalLink, Eye } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest } from '../../../lib/api';

const STATUS_OPTIONS = ['NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'NOT_A_FIT', 'SAVED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED'];

const statusColor = (s) => {
  if (s === 'NEW') return 'bg-accent/20 text-black';
  if (s === 'CONTACTED') return 'bg-blue-100 text-blue-800';
  if (s === 'INTERESTED') return 'bg-green-100 text-green-800';
  if (s === 'QUALIFIED') return 'bg-emerald-100 text-emerald-800';
  if (s === 'NOT_A_FIT' || s === 'DISQUALIFIED') return 'bg-red-100 text-red-800';
  if (s === 'ARCHIVED') return 'bg-gray-100 text-gray-600';
  return 'bg-gray-100 text-gray-700';
};

const scoreBadge = (analysis) => {
  if (!analysis) return null;
  const { opportunityScore, scoreLevel } = analysis;
  const color = scoreLevel === 'GOLD' ? 'bg-yellow-100 text-yellow-800' :
    scoreLevel === 'HIGH' ? 'bg-green-100 text-green-800' :
    scoreLevel === 'MEDIUM' ? 'bg-blue-100 text-blue-800' :
    'bg-gray-100 text-gray-700';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>{opportunityScore}</span>;
};

const DashboardLeadListsPage = ({ onNavigate }) => {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterScore, setFilterScore] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMissingWeb, setFilterMissingWeb] = useState(false);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedLead, setSelectedLead] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [signals, setSignals] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const selectedListId = new URLSearchParams(window.location.search).get('listId');

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (selectedListId) params.set('listId', selectedListId);
        if (filterSource) params.set('source', filterSource);
        if (filterCity) params.set('city', filterCity);
        if (filterScore) params.set('scoreLevel', filterScore);
        if (filterStatus) params.set('status', filterStatus);
        if (filterMissingWeb) params.set('missingWebsite', 'true');
        if (sortBy) params.set('sortBy', sortBy);
        if (sortOrder) params.set('sortOrder', sortOrder);
        const qs = params.toString();
        const res = await apiRequest(`/api/search/leads${qs ? `?${qs}` : ''}`);
        setLeads(res.data.leads || []);
      } catch (err) {
        setError(err.message || 'Failed to load leads');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeads();
  }, [selectedListId, filterSource, filterCity, filterScore, filterStatus, filterMissingWeb, sortBy, sortOrder]);

  useEffect(() => {
    if (!selectedListId) {
      return;
    }

    apiRequest(`/api/search/lists/${selectedListId}`)
      .then((res) => setActiveList(res.data.list || null))
      .catch(() => setActiveList(null));
  }, [selectedListId]);

  useEffect(() => {
    apiRequest('/api/search/opportunity-signals?limit=5')
      .then((res) => setSignals(res.data.signals || []))
      .catch(() => setSignals([]));
  }, []);

  const cities = useMemo(() => [...new Set(leads.map((l) => l.city).filter(Boolean))], [leads]);
  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean))], [leads]);

  const filtered = useMemo(() => {
    if (!searchQuery) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter((l) =>
      l.businessName.toLowerCase().includes(q) ||
      (l.category || '').toLowerCase().includes(q) ||
      (l.city || '').toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => o === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const updateStatus = async (leadId, newStatus) => {
    setUpdatingStatus(leadId);
    try {
      await apiRequest(`/api/search/leads/${leadId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus } : l));
    } catch {
      // silent
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <DashboardCard className="min-h-[calc(100vh-132px)] overflow-hidden p-5 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
            <Table2 size={26} />
          </div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Spreadsheet-style lead list</p>
          <h2 className="mt-3 text-4xl font-bold tracking-tighter md:text-5xl">Lead Lists</h2>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-secondary">
            Search results stored as structured lead rows. Filter, sort, and manage your pipeline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/dashboard/find-leads')}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {selectedListId && activeList && (
        <div className="mt-6 rounded-[20px] border border-accent/40 bg-accent/10 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">Active result set</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-tight">{activeList.name}</h3>
              <p className="mt-1 text-sm font-semibold text-secondary">
                Source requested: {activeList.sourceRequested || 'Local Dataset'} · Source used: {activeList.sourceUsed || 'Local Dataset'}
                {activeList.fallbackUsed ? ' · dataset fallback' : ''}
              </p>
            </div>
            <span className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-bold text-black">
              {activeList.leadCount || 0} matched leads
            </span>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/50" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-black/[0.08] bg-[#F7F8F6] pl-10 pr-4 text-xs font-semibold outline-none focus:border-black/20 focus:bg-white"
          />
        </div>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none">
          <option value="">All Sources</option>
          {sources.map((s) => <option key={s} value={s}>{s?.replace('_', ' ')}</option>)}
        </select>
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none">
          <option value="">All Cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterScore} onChange={(e) => setFilterScore(e.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none">
          <option value="">All Scores</option>
          <option value="GOLD">Gold</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 py-2 text-xs font-bold cursor-pointer">
          <input type="checkbox" checked={filterMissingWeb} onChange={(e) => setFilterMissingWeb(e.target.checked)} className="accent-accent" />
          No website
        </label>
      </div>

      {/* Table */}
      <div className="mt-5 rounded-[20px] border border-black/[0.08] bg-[#F7F8F6] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">Opportunity Signals</p>
            <p className="mt-1 text-sm font-semibold text-secondary">
              Reddit and forum-style sources will appear here as demand signals, separate from verified business listings.
            </p>
          </div>
          <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-bold text-black">
            {signals.length} signal{signals.length === 1 ? '' : 's'}
          </span>
        </div>
        {signals.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {signals.map((signal) => {
              const content = (
                <>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-secondary">{signal.source} · {signal.detectedIntent || 'Signal'}</span>
                  <span className="mt-1 block">{signal.title}</span>
                </>
              );

              return signal.sourceUrl ? (
                <a
                  key={signal.id}
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-black/[0.08] bg-white p-3 text-sm font-bold transition-colors hover:border-accent"
                >
                  {content}
                </a>
              ) : (
                <div key={signal.id} className="rounded-2xl border border-black/[0.08] bg-white p-3 text-sm font-bold">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-[20px] border border-black/[0.08] bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] gap-2 bg-[#F7F8F6] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-secondary">
              <span>Business</span>
              <span>Category</span>
              <span>City</span>
              <span>Source</span>
              <span>Website</span>
              <span>Instagram</span>
              <span>Contact</span>
              <span>Signals</span>
              <button type="button" onClick={() => toggleSort('reviewCount')} className="flex items-center gap-1 hover:text-black"><span>Score</span><ArrowUpDown size={10} /></button>
              <span>Status</span>
              <span>Actions</span>
            </div>
            
            {isLoading ? (
              <div className="flex h-32 items-center justify-center border-t border-black/[0.06]">
                <Loader2 size={24} className="animate-spin text-secondary" />
              </div>
            ) : filtered.length > 0 ? (
              <div className="flex flex-col divide-y divide-black/[0.06]">
                {filtered.map((lead) => {
                  const a = lead.analyses?.[0];
                  const isCatalogSnapshot = Boolean(lead.catalogOnly || (lead.catalogLeadId && !lead.userLeadId));
                  return (
                    <div key={lead.leadListItemId || lead.id} className="grid grid-cols-[1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] items-center gap-2 px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#F7F8F6]">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-xs">{lead.businessName}</p>
                        {lead.rating && <p className="text-[10px] text-secondary mt-0.5">{lead.rating}★ ({lead.reviewCount || 0})</p>}
                      </div>
                      <div className="truncate text-xs text-secondary">{lead.category || '-'}</div>
                      <div className="truncate text-xs">{lead.city || '-'}</div>
                      <div className="truncate text-[10px] font-bold text-secondary">{(lead.source || '-').replace(/_/g, ' ')}</div>
                      <div className="text-xs">
                        {lead.websiteUrl ? (
                          <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-dark hover:underline">
                            <Link2 size={12} /> Visit
                          </a>
                        ) : <span className="text-red-400 text-[10px] font-bold">Missing</span>}
                      </div>
                      <div className="text-xs">
                        {lead.instagramUrl ? (
                          <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-dark hover:underline">
                            <ExternalLink size={12} /> Open
                          </a>
                        ) : (lead.instagramUsername ? <span className="text-[10px] font-bold">@{lead.instagramUsername}</span> : <span className="text-secondary/40">-</span>)}
                      </div>
                      <div className="truncate text-xs text-secondary">{lead.phone || '-'}</div>
                      <div className="min-w-0">
                        {a?.detectedSignals?.length ? (
                          <div className="flex flex-wrap gap-0.5">
                            {a.detectedSignals.slice(0, 2).map((sig) => (
                              <span key={sig} className="rounded bg-black/[0.04] px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider">{sig.replace(/_/g, ' ')}</span>
                            ))}
                            {a.detectedSignals.length > 2 && <span className="text-[9px] text-secondary">+{a.detectedSignals.length - 2}</span>}
                          </div>
                        ) : <span className="text-secondary/40 text-xs">-</span>}
                      </div>
                      <div>{scoreBadge(a) || <span className="text-secondary/40 text-xs">-</span>}</div>
                      <div className="relative">
                        <select
                          value={lead.status}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          disabled={isCatalogSnapshot || updatingStatus === lead.id}
                          title={isCatalogSnapshot ? 'Status updates will be available after saving a catalog lead to your workspace.' : 'Update lead status'}
                          className={`h-7 rounded-lg border-0 px-1.5 text-[10px] font-bold uppercase outline-none ${isCatalogSnapshot ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${statusColor(lead.status)}`}
                        >
                          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedLead(selectedLead === lead.id ? null : lead.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.04] text-secondary hover:bg-accent hover:text-black transition-colors"
                          title="View details"
                        >
                          <Eye size={13} />
                        </button>
                        {lead.googleMapsUrl && (
                          <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer" className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.04] text-secondary hover:bg-accent hover:text-black transition-colors" title="Open in Maps">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        
        {!isLoading && filtered.length === 0 && (
          <div className="border-t border-black/[0.06] p-5">
            <DashboardEmptyState
              title="No leads found"
              description={leads.length > 0 ? 'Try adjusting your filters or search query.' : 'Create your first search campaign to start collecting opportunities.'}
              actionLabel={leads.length > 0 ? 'Clear filters' : 'Create Search Campaign'}
              onAction={() => leads.length > 0 ? (setSearchQuery(''), setFilterSource(''), setFilterCity(''), setFilterScore(''), setFilterStatus(''), setFilterMissingWeb(false)) : onNavigate('/dashboard/find-leads')}
            />
          </div>
        )}
      </div>

      {/* Lead count */}
      {!isLoading && filtered.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-secondary">
          Showing {filtered.length} lead{filtered.length !== 1 ? 's' : ''}{leads.length !== filtered.length ? ` (${leads.length} total)` : ''}
        </p>
      )}
    </DashboardCard>
  );
};

export default DashboardLeadListsPage;
