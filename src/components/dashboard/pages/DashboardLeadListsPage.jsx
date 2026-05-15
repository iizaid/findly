import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, Link2, AlertCircle, Search, ArrowUpDown, ExternalLink, Eye, Play, FileText, CheckCircle2 } from 'lucide-react';
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

const formatSignalSource = (source) => {
  const map = {
    LOCAL_DATASET: 'Platform Signals',
    DATASET_IMPORT: 'Platform Signals',
    INSTAGRAM_DATASET: 'Instagram Signals',
    GOOGLE_MAPS_DATASET: 'Google Maps Signals',
  };
  return map[source] || source?.replace(/_/g, ' ') || 'Available Signals';
};

const platformLabel = {
  INSTAGRAM: 'Instagram',
  GOOGLE_MAPS: 'Google Maps',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Website',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TRIPADVISOR: 'TripAdvisor',
  YELP: 'Yelp',
  X: 'X',
};

const listPlatformLabel = (list) => list?.filters?.platformsRequested?.map((p) => platformLabel[p] || p).join(', ')
  || list?.sourceRequested
  || 'Available Signals';

const DashboardLeadListsPage = ({ onNavigate }) => {
  const [leads, setLeads] = useState([]);
  const [savedLists, setSavedLists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
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
  const [analyzingLead, setAnalyzingLead] = useState(null);
  const [analyzingList, setAnalyzingList] = useState(false);
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesValue, setNotesValue] = useState('');
  const [activeList, setActiveList] = useState(null);
  const selectedListId = new URLSearchParams(window.location.search).get('listId');

  useEffect(() => {
    let mounted = true;

    const fetchSavedLists = async () => {
      try {
        setIsLoadingLists(true);
        const res = await apiRequest('/api/search/lists?limit=50');
        if (!mounted) return;
        const lists = res.data.lists || [];
        setSavedLists(lists);

        if (!selectedListId && lists[0]?.id) {
          onNavigate?.(`/dashboard/lead-lists?listId=${lists[0].id}`);
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load saved searches');
      } finally {
        if (mounted) setIsLoadingLists(false);
      }
    };

    fetchSavedLists();

    return () => {
      mounted = false;
    };
  }, [selectedListId, onNavigate]);

  useEffect(() => {
    const fetchLeads = async () => {
      if (!selectedListId) {
        setLeads([]);
        setActiveList(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set('listId', selectedListId);
        if (filterSource) params.set('source', filterSource);
        if (filterCity) params.set('city', filterCity);
        if (filterScore) params.set('scoreLevel', filterScore);
        if (filterStatus) params.set('status', filterStatus);
        if (filterMissingWeb) params.set('missingWebsite', 'true');
        if (sortBy) params.set('sortBy', sortBy);
        if (sortOrder) params.set('sortOrder', sortOrder);
        const res = await apiRequest(`/api/search/leads?${params.toString()}`);
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
      setActiveList(null);
      return;
    }

    apiRequest(`/api/search/lists/${selectedListId}`)
      .then((res) => setActiveList(res.data.list || null))
      .catch(() => setActiveList(null));
  }, [selectedListId]);

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

  const getTargetId = (lead) => lead.leadListItemId || lead.id;

  const updateStatus = async (lead, newStatus) => {
    const targetId = getTargetId(lead);
    const isListItem = !!lead.leadListItemId;
    setUpdatingStatus(targetId);
    try {
      if (isListItem && selectedListId) {
        await apiRequest(`/api/search/lists/${selectedListId}/items/${targetId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
      } else if (!lead.catalogOnly) {
        await apiRequest(`/api/search/leads/${lead.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
      }
      setLeads((prev) => prev.map((l) => getTargetId(l) === targetId ? { ...l, status: newStatus } : l));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const saveNotes = async (lead) => {
    const targetId = getTargetId(lead);
    const isListItem = !!lead.leadListItemId;
    if (!isListItem || !selectedListId) return;

    try {
      await apiRequest(`/api/search/lists/${selectedListId}/items/${targetId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: notesValue }),
      });
      setLeads((prev) => prev.map((l) => getTargetId(l) === targetId ? { ...l, notes: notesValue } : l));
      setEditingNotes(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const analyzeLead = async (lead) => {
    const targetId = getTargetId(lead);
    const isListItem = !!lead.leadListItemId;
    setAnalyzingLead(targetId);
    setError(null);
    try {
      let res;
      if (isListItem && selectedListId) {
        res = await apiRequest(`/api/search/lists/${selectedListId}/items/${targetId}/analyze`, { method: 'POST' });
      } else if (!lead.catalogOnly) {
        res = await apiRequest(`/api/search/leads/${lead.id}/analyze`, { method: 'POST' });
      }
      if (res?.data?.analysis) {
        setLeads((prev) => prev.map((l) => getTargetId(l) === targetId ? { ...l, analyses: [res.data.analysis] } : l));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingLead(null);
    }
  };

  const analyzeList = async () => {
    if (!selectedListId) return;
    setAnalyzingList(true);
    setError(null);
    try {
      const res = await apiRequest(`/api/search/lists/${selectedListId}/analyze`, { method: 'POST' });
      if (res?.data?.analyzedCount > 0) {
        const refRes = await apiRequest(`/api/search/leads?listId=${selectedListId}`);
        setLeads(refRes.data.leads || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingList(false);
    }
  };

  return (
    <DashboardCard className="min-h-[calc(100vh-132px)] overflow-hidden p-5 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl text-black">Lead Lists</h2>
          <p className="mt-2 text-sm font-medium text-black/50">
            Structured search results and opportunity lists.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {savedLists.length > 0 && (
              <select
              value={selectedListId || ''}
              onChange={(e) => onNavigate?.(`/dashboard/lead-lists?listId=${e.target.value}`)}
              className="h-10 min-w-[240px] rounded-xl border border-black/5 bg-black/[0.02] px-4 text-[13px] font-medium text-black outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Saved searches"
            >
              {savedLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} • {list.leadCount || 0} leads
                </option>
              ))}
            </select>
          )}
          {selectedListId && (
            <button
              type="button"
              onClick={analyzeList}
              disabled={analyzingList}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white shadow-sm ring-1 ring-black/5 px-4 text-[13px] font-medium text-black transition-colors hover:bg-black/[0.02] disabled:opacity-50"
            >
              {analyzingList ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Analyze List
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('/dashboard/find-leads')}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-black px-4 text-[13px] font-medium text-white shadow-md outline-none transition-all hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={16} />
            New Campaign
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {isLoadingLists && !selectedListId && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] p-4 text-sm font-bold text-secondary">
          <Loader2 size={18} className="animate-spin" />
          Loading saved searches...
        </div>
      )}

      {selectedListId && activeList && (
        <div className="mt-8 rounded-2xl border border-black/5 bg-black/[0.01] p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-black">{activeList.name}</h3>
              <p className="mt-1 text-[13px] text-black/50">
                Sources: {listPlatformLabel(activeList)}
              </p>
            </div>
            <span className="inline-flex h-8 items-center rounded-lg bg-black/[0.04] px-3 text-[12px] font-medium text-black/70">
              {activeList.leadCount || 0} leads matched
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-black/5 bg-black/[0.02] pl-10 pr-4 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus:border-black/20 focus:bg-white"
          />
        </div>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-10 rounded-xl border border-black/5 bg-black/[0.02] px-3 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04]">
          <option value="">All Platforms</option>
          {sources.map((s) => <option key={s} value={s}>{formatSignalSource(s)}</option>)}
        </select>
        <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="h-10 rounded-xl border border-black/5 bg-black/[0.02] px-3 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04]">
          <option value="">All Cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterScore} onChange={(e) => setFilterScore(e.target.value)} className="h-10 rounded-xl border border-black/5 bg-black/[0.02] px-3 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04]">
          <option value="">All Scores</option>
          <option value="GOLD">Gold</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-10 rounded-xl border border-black/5 bg-black/[0.02] px-3 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04]">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-black/5 bg-black/[0.02] px-3 text-[13px] font-medium cursor-pointer transition-colors hover:bg-black/[0.04]">
          <input type="checkbox" checked={filterMissingWeb} onChange={(e) => setFilterMissingWeb(e.target.checked)} className="accent-black" />
          No website
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-sm ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] gap-2 border-b border-black/[0.04] bg-[#FBFBFB] px-5 py-3 text-[12px] font-medium text-black/50">
              <span>Business</span>
              <span>Category</span>
              <span>City</span>
              <span>Platform</span>
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
                  const targetId = getTargetId(lead);
                  const isExpanded = selectedLead === targetId;
                  const isListItem = !!lead.leadListItemId;
                  const isCatalogLeadWithoutList = lead.catalogOnly && !isListItem;
                  const a = lead.analyses?.[0];
                  
                  return (
                    <div key={targetId} className="flex flex-col">
                      <div className={`grid grid-cols-[1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] items-center gap-2 px-5 py-3.5 text-[13px] font-medium text-black/90 transition-colors ${isExpanded ? 'bg-black/[0.02]' : 'hover:bg-black/[0.01]'}`}>
                        <div className="min-w-0 cursor-pointer" onClick={() => setSelectedLead(isExpanded ? null : targetId)}>
                          <p className="truncate font-semibold text-black">{lead.businessName}</p>
                          {lead.rating && <p className="text-[11px] text-black/50 mt-0.5">{lead.rating}★ ({lead.reviewCount || 0})</p>}
                        </div>
                        <div className="truncate text-black/60">{lead.category || '-'}</div>
                        <div className="truncate">{lead.city || '-'}</div>
                        <div className="truncate text-[11px] text-black/60" title={formatSignalSource(lead.source)}>{formatSignalSource(lead.source)}</div>
                        <div>
                          {lead.websiteUrl ? (
                            <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                              <Link2 size={13} /> Visit
                            </a>
                          ) : <span className="text-red-500 text-[11px]">Missing</span>}
                        </div>
                        <div>
                          {lead.instagramUrl ? (
                            <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-black hover:underline">
                              <ExternalLink size={13} /> Open
                            </a>
                          ) : (lead.instagramUsername ? <span className="text-[11px]">@{lead.instagramUsername}</span> : <span className="text-black/30">-</span>)}
                        </div>
                        <div className="truncate text-black/60">{lead.phone || '-'}</div>
                        <div className="min-w-0">
                          {a?.detectedSignals?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {a.detectedSignals.slice(0, 2).map((sig) => (
                                <span key={sig} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-black/60">{sig.replace(/_/g, ' ')}</span>
                              ))}
                              {a.detectedSignals.length > 2 && <span className="text-[10px] text-black/50">+{a.detectedSignals.length - 2}</span>}
                            </div>
                          ) : <span className="text-black/30">-</span>}
                        </div>
                        <div>{scoreBadge(a) || <span className="text-black/30">-</span>}</div>
                        <div className="relative">
                          <select
                            value={lead.status}
                            onChange={(e) => updateStatus(lead, e.target.value)}
                            disabled={isCatalogLeadWithoutList || updatingStatus === targetId}
                            title={isCatalogLeadWithoutList ? 'Status updates will be available after saving a catalog lead to your workspace.' : 'Update lead status'}
                            className={`h-7 w-full rounded-md border-0 px-2 text-[11px] font-medium outline-none ${isCatalogLeadWithoutList ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${statusColor(lead.status)} ring-1 ring-black/5`}
                          >
                            {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedLead(isExpanded ? null : targetId)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${isExpanded ? 'bg-accent text-black' : 'bg-black/[0.04] text-secondary hover:bg-accent hover:text-black'}`}
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
                      {isExpanded && (
                        <div className="bg-black/[0.01] px-5 pb-5 pt-3 border-t border-black/[0.02]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[13px] font-semibold text-black">AI Analysis</h4>
                                {!a && !isCatalogLeadWithoutList && (
                                  <button 
                                    onClick={() => analyzeLead(lead)}
                                    disabled={analyzingLead === targetId}
                                    className="flex items-center gap-1.5 rounded-lg bg-black/[0.04] px-3 py-1.5 text-[12px] font-medium text-black hover:bg-black/[0.08] disabled:opacity-50 transition-colors"
                                  >
                                    {analyzingLead === targetId ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                    Analyze
                                  </button>
                                )}
                              </div>
                              
                              {a ? (
                                <div className="space-y-4 mt-2">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[12px] font-medium text-black/40">Suggested Service</span>
                                    <span className="text-[13px] font-medium text-black">{a.suggestedService}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[12px] font-medium text-black/40">Outreach Angle</span>
                                    <span className="text-[13px] text-black/80 leading-relaxed">{a.outreachAngle}</span>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[12px] font-medium text-black/40">Message Draft</span>
                                    <div className="rounded-xl border border-black/[0.04] bg-black/[0.02] p-4 text-[13px] leading-relaxed text-black/80 whitespace-pre-wrap">
                                      {a.messageDraft}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="py-8 text-center">
                                  <p className="text-[13px] text-black/40">No analysis available for this lead yet.</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-4">
                              {isListItem && (
                                <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-[13px] font-semibold text-black flex items-center gap-1.5"><FileText size={14} className="text-black/40" /> Notes</h4>
                                    {editingNotes !== targetId ? (
                                      <button 
                                        onClick={() => {
                                          setNotesValue(lead.notes || '');
                                          setEditingNotes(targetId);
                                        }}
                                        className="text-[12px] font-medium text-blue-600 hover:underline"
                                      >
                                        Edit
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => saveNotes(lead)}
                                        className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 hover:underline"
                                      >
                                        <CheckCircle2 size={14} /> Save
                                      </button>
                                    )}
                                  </div>
                                  
                                  {editingNotes === targetId ? (
                                    <textarea
                                      value={notesValue}
                                      onChange={(e) => setNotesValue(e.target.value)}
                                      className="w-full rounded-xl border border-black/10 bg-black/[0.01] p-3 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent min-h-[80px]"
                                      placeholder="Add your notes here..."
                                    />
                                  ) : (
                                    <p className="text-[13px] text-black/80 leading-relaxed min-h-[40px] whitespace-pre-wrap">
                                      {lead.notes || <span className="text-black/30 italic">No notes added.</span>}
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm">
                                <h4 className="text-[13px] font-semibold text-black mb-4">Lead Details</h4>
                                <div className="grid grid-cols-2 gap-y-3 text-[13px]">
                                  <div className="text-black/50 font-medium">Email</div>
                                  <div className="truncate text-black/90" title={lead.email}>{lead.email || '-'}</div>
                                  <div className="text-black/50 font-medium">Address</div>
                                  <div className="truncate text-black/90" title={lead.address}>{lead.address || '-'}</div>
                                  <div className="text-black/50 font-medium">Record Type</div>
                                  <div className="text-black/90">{isListItem ? 'Saved Result' : (lead.catalogOnly ? 'Lead Intelligence' : 'Workspace Lead')}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
              title={savedLists.length > 0 ? 'No leads in this saved search' : 'No saved searches yet'}
              description={savedLists.length > 0 ? 'Try adjusting your filters or choose another saved search result set.' : 'Create your first search campaign. Every completed search will be saved here.'}
              actionLabel={savedLists.length > 0 ? 'Clear filters' : 'Create Search Campaign'}
              onAction={() => savedLists.length > 0 ? (setSearchQuery(''), setFilterSource(''), setFilterCity(''), setFilterScore(''), setFilterStatus(''), setFilterMissingWeb(false)) : onNavigate('/dashboard/find-leads')}
            />
          </div>
        )}
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-secondary">
          Showing {filtered.length} lead{filtered.length !== 1 ? 's' : ''}{leads.length !== filtered.length ? ` (${leads.length} total)` : ''}
        </p>
      )}
    </DashboardCard>
  );
};

export default DashboardLeadListsPage;
