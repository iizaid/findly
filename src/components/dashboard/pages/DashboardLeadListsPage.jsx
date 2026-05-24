import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Loader2, Link2, AlertCircle, Search, ArrowUpDown, ExternalLink, Eye, Play, FileText, CheckCircle2, X, Globe, MapPin, Phone, Mail } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest, getLeadListAnalysisJob, startLeadListAnalysis } from '../../../lib/api';
import { safeExternalUrl } from '../../../lib/urlSafety';
import useGsapPageReveal from '../../../hooks/useGsapPageReveal';

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
    ONLINE_SOURCE: 'Online Source',
    WEBSITE: 'Website',
    GOOGLE_MAPS: 'Google Maps',
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
  };
  return map[source] || source?.replace(/_/g, ' ') || 'Search';
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

const listPlatformLabel = (list) => list?.platformsRequested?.map((p) => platformLabel[p] || p).join(', ')
  || 'Not recorded';

const formatFindingLabel = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized
    .replace(/^AI_GAP:/i, '')
    .replace(/^DATA_QUALITY_/i, 'Quality ')
    .replace(/^HAS_/i, '')
    .replace(/^NO_/i, 'No ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const dataQualityTone = (level) => {
  if (level === 'HIGH') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (level === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-red-50 text-red-700 border-red-100';
};

const outreachState = (analysis) => {
  const readiness = analysis?.scoreDimensions?.find((item) => item.key === 'outreach_readiness')?.value ?? 0;
  if ((analysis?.dataQualityLevel === 'HIGH') || readiness >= 65) {
    return { label: 'Outreach ready', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  }
  if (analysis?.dataQualityLevel === 'MEDIUM') {
    return { label: 'Needs review', className: 'bg-amber-50 text-amber-700 border-amber-100' };
  }
  return { label: 'Needs evidence', className: 'bg-red-50 text-red-700 border-red-100' };
};

const analysisStatusMeta = (job) => {
  const status = job?.listStatus || job?.status || 'NOT_ANALYZED';
  if (status === 'ANALYSIS_RUNNING' || status === 'RUNNING' || status === 'QUEUED') {
    return {
      label: 'Analysis running',
      className: 'bg-blue-50 text-blue-700 border-blue-100',
    };
  }
  if (status === 'ANALYSIS_COMPLETE' || status === 'COMPLETED') {
    return {
      label: 'Analysis complete',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };
  }
  if (status === 'NEEDS_REANALYSIS') {
    return {
      label: 'Needs re-analysis',
      className: 'bg-amber-50 text-amber-700 border-amber-100',
    };
  }
  if (status === 'ANALYSIS_FAILED' || status === 'FAILED' || status === 'CANCELLED') {
    return {
      label: 'Analysis failed',
      className: 'bg-red-50 text-red-700 border-red-100',
    };
  }
  return {
    label: 'Not analyzed',
    className: 'bg-black/[0.04] text-black/65 border-black/[0.06]',
  };
};

const formatDetailValue = (value, fallback = '-') => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

const compactCategoryLocation = (lead) => [lead.category, lead.city].filter(Boolean).join(' • ') || 'Category and city not recorded';

const getContactCoverage = (lead) => {
  let count = 0;
  if (lead.phone) count += 1;
  if (lead.email) count += 1;
  if (lead.websiteUrl) count += 1;
  if (lead.instagramUrl || lead.instagramUsername) count += 1;
  if (lead.facebookUrl) count += 1;
  return count;
};

const getEvidenceItems = (analysis) => {
  const findings = Array.isArray(analysis?.detectedSignals) ? analysis.detectedSignals : [];
  return findings.slice(0, 4).map(formatFindingLabel).filter(Boolean);
};

const getTargetId = (lead) => lead?.leadListItemId || lead?.id;

const getDisplayHost = (url) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const buildInstagramUrl = (lead) => {
  const safeUrl = safeExternalUrl(lead?.instagramUrl);
  if (safeUrl) return safeUrl;
  if (lead?.instagramUsername) {
    return `https://instagram.com/${String(lead.instagramUsername).replace(/^@/, '')}`;
  }
  return null;
};

const DashboardLeadListsPage = ({ onNavigate, onUpdate }) => {
  const pageRef = useRef(null);
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
  const [editingNotes, setEditingNotes] = useState(null);
  const [notesValue, setNotesValue] = useState('');
  const [activeList, setActiveList] = useState(null);
  const [analysisJob, setAnalysisJob] = useState(null);
  const [startingAnalysisJob, setStartingAnalysisJob] = useState(false);
  const [page, setPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const selectedListId = new URLSearchParams(window.location.search).get('listId');
  const selectedLeadRecord = leads.find((lead) => getTargetId(lead) === selectedLead) || null;

  useGsapPageReveal(pageRef);

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
        setAnalysisJob(null);
        setPage(1);
        setTotalLeads(0);
        setIsLoading(false);
        return;
      }

      try {
        if (page === 1) setIsLoading(true);
        else setIsLoadingMore(true);

        const params = new URLSearchParams();
        params.set('listId', selectedListId);
        params.set('limit', '100');
        params.set('page', page.toString());
        if (filterSource) params.set('source', filterSource);
        if (filterCity) params.set('city', filterCity);
        if (filterScore) params.set('scoreLevel', filterScore);
        if (filterStatus) params.set('status', filterStatus);
        if (filterMissingWeb) params.set('missingWebsite', 'true');
        if (sortBy) params.set('sortBy', sortBy);
        if (sortOrder) params.set('sortOrder', sortOrder);
        const res = await apiRequest(`/api/search/leads?${params.toString()}`);
        
        const newLeads = res.data.leads || [];
        setTotalLeads(res.data.pagination?.total || 0);
        
        if (page === 1) {
          setLeads(newLeads);
        } else {
          setLeads((prev) => {
            const existingIds = new Set(prev.map(l => l.leadListItemId || l.id));
            const uniqueNew = newLeads.filter(l => !existingIds.has(l.leadListItemId || l.id));
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        setError(err.message || 'Failed to load leads');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    };
    fetchLeads();
  }, [selectedListId, filterSource, filterCity, filterScore, filterStatus, filterMissingWeb, sortBy, sortOrder, page, analysisJob?.status]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedListId, filterSource, filterCity, filterScore, filterStatus, filterMissingWeb, sortBy, sortOrder]);

  useEffect(() => {
    setSelectedLeadIds([]);
  }, [selectedListId]);

  useEffect(() => {
    if (!selectedLeadRecord) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedLead(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLeadRecord]);

  useEffect(() => {
    if (!selectedListId) {
      setActiveList(null);
      return;
    }

    apiRequest(`/api/search/lists/${selectedListId}`)
      .then((res) => setActiveList(res.data.list || null))
      .catch(() => setActiveList(null));
  }, [selectedListId]);

  useEffect(() => {
    if (!selectedListId) {
      setAnalysisJob(null);
      return undefined;
    }

    let active = true;
    let intervalId = null;

    const refreshAnalysisJob = async () => {
      try {
        const res = await getLeadListAnalysisJob(selectedListId);
        if (!active) return;
        const nextJob = res.data?.job || null;
        setAnalysisJob(nextJob);
        if (nextJob?.status === 'COMPLETED') {
          onUpdate?.();
          const listRes = await apiRequest(`/api/search/lists/${selectedListId}`);
          if (active) setActiveList(listRes.data.list || null);
        }
      } catch {
        if (active) setAnalysisJob(null);
      }
    };

    refreshAnalysisJob();
    intervalId = window.setInterval(() => {
      if (analysisJob?.status && !['QUEUED', 'RUNNING'].includes(analysisJob.status)) return;
      refreshAnalysisJob();
    }, 2500);

    return () => {
      active = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [selectedListId, onUpdate, analysisJob?.status]);

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

  const activeAnalysisStatus = analysisStatusMeta(analysisJob || activeList);
  const analysisJobRunning = ['QUEUED', 'RUNNING', 'ANALYSIS_RUNNING'].includes(analysisJob?.status || analysisJob?.listStatus || activeList?.analysisStatus);
  const activeSummary = analysisJob?.summary || activeList?.analysisSummary || null;
  const progressPercent = Math.min(100, Math.round(((analysisJob?.progressCurrent || 0) / Math.max(analysisJob?.progressTotal || 1, 1)) * 100));
  const summaryCards = [
    { label: 'Lead count', value: totalLeads || activeList?.leadCount || 0 },
    { label: 'Analyzed', value: activeSummary?.totalAnalyzed ?? 0 },
    { label: 'Outreach ready', value: activeSummary?.outreachReadyCount ?? 0 },
    { label: 'Needs evidence', value: activeSummary?.needsMoreEvidenceCount ?? 0 },
    { label: 'Credits used', value: activeSummary?.creditsUsed ?? 0 },
  ];

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => o === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeadIds((current) => (
      current.includes(leadId)
        ? current.filter((item) => item !== leadId)
        : [...current, leadId]
    ));
  };

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

  const analyzeLead = async (lead, force = false) => {
    const targetId = getTargetId(lead);
    const isListItem = !!lead.leadListItemId;
    
    if (force && !window.confirm('Re-analyzing with AI will consume 1 search credit. Do you want to proceed?')) {
      return;
    }
    
    setAnalyzingLead(targetId);
    setError(null);
    try {
      let res;
      if (isListItem && selectedListId) {
        res = await apiRequest(`/api/search/lists/${selectedListId}/items/${targetId}/analyze${force ? '?force=true' : ''}`, { method: 'POST' });
      } else if (!lead.catalogOnly) {
        res = await apiRequest(`/api/search/leads/${lead.id}/analyze${force ? '?force=true' : ''}`, { method: 'POST' });
      }
      if (res?.data?.analysis) {
        setLeads((prev) => prev.map((l) => getTargetId(l) === targetId ? { ...l, analyses: [res.data.analysis] } : l));
        onUpdate?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingLead(null);
    }
  };

  const analyzeList = async () => {
    if (!selectedListId) return;
    setStartingAnalysisJob(true);
    setError(null);
    try {
      const res = await startLeadListAnalysis(selectedListId);
      setAnalysisJob(res.data?.job || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setStartingAnalysisJob(false);
    }
  };

  const modalLead = selectedLeadRecord;
  const modalAnalysis = modalLead?.analyses?.[0] || null;
  const modalTargetId = modalLead ? getTargetId(modalLead) : null;
  const modalWebsiteUrl = safeExternalUrl(modalLead?.websiteUrl);
  const modalInstagramUrl = buildInstagramUrl(modalLead);
  const modalFacebookUrl = safeExternalUrl(modalLead?.facebookUrl);
  const modalGoogleMapsUrl = safeExternalUrl(modalLead?.googleMapsUrl);
  const modalReadiness = outreachState(modalAnalysis);
  const modalDataQuality = modalAnalysis?.dataQualityLevel || modalAnalysis?.scoreBreakdown?.dataQualityLevel || '-';
  const modalContactabilityDimension = modalAnalysis?.scoreDimensions?.find?.((item) => item.key === 'contact_path') || modalAnalysis?.scoreBreakdown?.dimensions?.find?.((item) => item.key === 'contact_path');
  const modalServiceFitDimension = modalAnalysis?.scoreDimensions?.find?.((item) => item.key === 'service_fit');
  const modalEvidenceItems = getEvidenceItems(modalAnalysis);
  const modalIsListItem = !!modalLead?.leadListItemId;
  const modalIsCatalogLeadWithoutList = modalLead?.catalogOnly && !modalIsListItem;

  return (
    <div ref={pageRef}>
    <DashboardCard className="min-h-[calc(100vh-132px)] overflow-hidden p-5 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between" data-gsap-reveal>
        <div data-gsap-stagger>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl text-black">Lead Lists</h2>
          <p className="mt-2 text-sm font-medium text-black/50">
            Structured search results and opportunity lists.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-gsap-stagger>
          {savedLists.length > 0 && (
            <div className="flex items-center gap-2">
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
              <span className={`inline-flex h-10 items-center rounded-xl border px-3 text-[12px] font-bold ${activeAnalysisStatus.className}`}>
                {activeAnalysisStatus.label}
              </span>
            </div>
          )}
          {selectedListId && (
            <button
              type="button"
              onClick={analyzeList}
              disabled={startingAnalysisJob || analysisJobRunning}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white shadow-sm ring-1 ring-black/5 px-4 text-[13px] font-medium text-black transition-colors hover:bg-black/[0.02] disabled:opacity-50"
            >
              {(startingAnalysisJob || analysisJobRunning) ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
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

      {(analysisJob || activeSummary) && (
        <div className="mt-6 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm" data-gsap-reveal>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-black flex items-center gap-2">
                  <CheckCircle2 size={18} className={analysisJob?.status === 'COMPLETED' ? 'text-emerald-500' : 'text-blue-500'} />
                  {analysisJob?.status === 'COMPLETED' ? 'Analysis complete' : 'Analysis progress'}
                </h3>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${activeAnalysisStatus.className}`}>
                  {activeAnalysisStatus.label}
                </span>
              </div>
              {analysisJob?.progressTotal > 0 && (
                <p className="mt-2 text-[13px] font-semibold text-black/55">
                  Analyzed {analysisJob.progressCurrent} of {analysisJob.progressTotal} leads
                </p>
              )}
            </div>
            {analysisJob?.progressTotal > 0 && (
              <div className="min-w-[220px] flex-1 lg:max-w-md">
                <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-black/55">
                  <span>Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full bg-[#B6FF00]"
                    style={{ width: `${progressPercent}%` }}
                    data-gsap-bar
                    data-gsap-bar-width={`${progressPercent}%`}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-black/[0.05] bg-[#F7F8F6] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">{card.label}</div>
                <div className="mt-2 text-xl font-bold text-black">{card.value}</div>
              </div>
            ))}
          </div>
          {analysisJob?.errorMessage && (
            <p className="mt-4 text-[12px] font-semibold text-red-600">{analysisJob.errorMessage}</p>
          )}
        </div>
      )}

      {isLoadingLists && !selectedListId && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-[#F7F8F6] p-4 text-sm font-bold text-secondary">
          <Loader2 size={18} className="animate-spin" />
          Loading saved searches...
        </div>
      )}

      {selectedListId && activeList && (
        <div className="mt-8 rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-5" data-gsap-reveal>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold tracking-tight text-black">{activeList.name}</h3>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${activeAnalysisStatus.className}`}>
                  {activeAnalysisStatus.label}
                </span>
              </div>
              <p className="text-[13px] font-medium text-black/50">
                Search focus: {listPlatformLabel(activeList)}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black/70">
                  {totalLeads || activeList.leadCount || 0} saved leads
                </span>
                <span className="inline-flex items-center rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black/70">
                  {activeSummary?.totalAnalyzed ?? 0} reviewed
                </span>
                <span className="inline-flex items-center rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black/70">
                  {activeSummary?.outreachReadyCount ?? 0} outreach ready
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="inline-flex h-9 items-center rounded-xl border border-black/[0.06] bg-white px-3 text-[12px] font-semibold text-black/70">
                Showing {leads.length} of {totalLeads || activeList.leadCount || 0}
              </span>
              <button
                type="button"
                onClick={() => onNavigate?.(`/dashboard/map?listId=${activeList.id}`)}
                className="inline-flex h-9 items-center rounded-xl bg-[#B6FF00] px-4 text-[12px] font-bold text-black transition-colors hover:bg-[#C8FF3D]"
              >
                Open on map
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLeadIds.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#B6FF00]/70 bg-[#F6FFD2] px-4 py-3">
          <p className="text-[13px] font-bold text-black">{selectedLeadIds.length} selected for Lead Map</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.(`/dashboard/map?leadIds=${selectedLeadIds.join(',')}`)}
              className="inline-flex h-10 items-center rounded-xl bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black/85"
            >
              View selected on map
            </button>
            <button
              type="button"
              onClick={() => setSelectedLeadIds([])}
              className="inline-flex h-10 items-center rounded-xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-black/[0.03]"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1 min-w-[200px]">
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
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-sm ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[0.36fr_1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] gap-2 border-b border-black/[0.04] bg-[#FBFBFB] px-5 py-3 text-[12px] font-medium text-black/50">
              <span>Select</span>
              <span>Business</span>
              <span>Category</span>
              <span>City</span>
              <span>Platform</span>
              <span>Website</span>
              <span>Instagram</span>
              <span>Contact</span>
              <span>Evidence</span>
              <button type="button" onClick={() => toggleSort('reviewCount')} className="flex items-center gap-1 hover:text-black"><span>Score</span><ArrowUpDown size={10} /></button>
              <span>Status</span>
              <span>Actions</span>
            </div>
            
            {isLoading ? (
              <div className="flex h-32 items-center justify-center border-t border-black/[0.06]">
                <Loader2 size={24} className="animate-spin text-secondary" />
              </div>
            ) : filtered.length > 0 ? (
              <>
                <div className="flex flex-col divide-y divide-black/[0.06]">
                  {filtered.map((lead) => {
                    const targetId = getTargetId(lead);
                    const isExpanded = selectedLead === targetId;
                    const isListItem = !!lead.leadListItemId;
                    const isCatalogLeadWithoutList = lead.catalogOnly && !isListItem;
                    const a = lead.analyses?.[0];
                    const websiteUrl = safeExternalUrl(lead.websiteUrl);
                    const googleMapsUrl = safeExternalUrl(lead.googleMapsUrl);
                    
                    return (
                        <div key={targetId} className="flex flex-col">
                        <div className={`grid grid-cols-[0.36fr_1.35fr_0.85fr_0.65fr_0.65fr_0.65fr_0.7fr_0.75fr_0.8fr_0.55fr_0.65fr_0.65fr] items-center gap-2 px-5 py-3.5 text-[13px] font-medium text-black/90 transition-colors ${isExpanded ? 'bg-black/[0.02]' : 'hover:bg-black/[0.01]'}`}>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(targetId)}
                              onChange={() => toggleLeadSelection(targetId)}
                              className="h-4 w-4 rounded border-black/20 accent-black"
                              aria-label={`Select ${lead.businessName}`}
                            />
                          </div>
                          <div className="min-w-0 cursor-pointer" onClick={() => setSelectedLead(isExpanded ? null : targetId)}>
                            <p className="truncate font-semibold text-black">{lead.businessName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-black/45">{compactCategoryLocation(lead)}</p>
                          </div>
                          <div className="truncate text-black/60">{lead.category || '-'}</div>
                          <div className="truncate">{lead.city || '-'}</div>
                          <div className="truncate text-[11px] text-black/60" title={formatSignalSource(lead.source)}>{formatSignalSource(lead.source)}</div>
                          <div>
                            {websiteUrl ? (
                              <a href={websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline" title={websiteUrl}>
                                <Link2 size={13} /> {getDisplayHost(websiteUrl)}
                              </a>
                            ) : <span className="text-red-500 text-[11px]">{lead.websiteUrl ? 'Invalid' : 'Missing'}</span>}
                          </div>
                          <div>
                            {buildInstagramUrl(lead) ? (
                              <a href={buildInstagramUrl(lead)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-black hover:underline" title={buildInstagramUrl(lead)}>
                                <ExternalLink size={13} /> @{String(lead.instagramUsername || '').replace(/^@/, '') || getDisplayHost(buildInstagramUrl(lead))}
                              </a>
                            ) : <span className="text-black/30">{lead.instagramUrl ? 'Invalid' : '-'}</span>}
                          </div>
                          <div className="truncate text-black/60">{lead.phone || '-'}</div>
                          <div className="min-w-0">
                            {getEvidenceItems(a).length ? (
                              <div className="flex flex-wrap gap-1">
                                {getEvidenceItems(a).slice(0, 2).map((item) => (
                                  <span key={item} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-black/60">{item}</span>
                                ))}
                                {getEvidenceItems(a).length > 2 && <span className="text-[10px] text-black/50">+{getEvidenceItems(a).length - 2}</span>}
                              </div>
                            ) : (
                              <span className="text-[11px] text-black/35">
                                {a?.dataQualityLevel ? `${a.dataQualityLevel.toLowerCase()} evidence` : '-'}
                              </span>
                            )}
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
                            {googleMapsUrl && (
                              <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/[0.04] text-secondary hover:bg-accent hover:text-black transition-colors" title="Open in Maps">
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {totalLeads > leads.length && !searchQuery && (
                  <div className="mt-6 mb-2 flex justify-center">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={isLoadingMore}
                      className="flex items-center gap-2 rounded-xl bg-black/[0.04] px-6 py-2.5 text-[13px] font-semibold text-black transition-colors hover:bg-black/[0.08] disabled:opacity-50"
                    >
                      {isLoadingMore && <Loader2 size={16} className="animate-spin" />}
                      {isLoadingMore ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
        
        {!isLoading && filtered.length === 0 && (
          <div className="border-t border-black/[0.06] p-5">
            <DashboardEmptyState
              title={savedLists.length > 0 ? 'No leads in this saved search' : 'No saved searches yet'}
              description={savedLists.length > 0 ? 'No matching local leads found for these filters. Try broader filters, fewer sources, or import more local data.' : 'Create your first search campaign. Every completed search will be saved here.'}
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
    {modalLead && (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-6 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
        <div
          className="max-h-[calc(100vh-48px)] w-full max-w-6xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl md:p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-semibold tracking-tight text-black">{modalLead.businessName}</h3>
                {modalAnalysis ? (
                  <>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${modalReadiness.className}`}>
                      {modalReadiness.label}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${dataQualityTone(modalDataQuality)}`}>
                      {modalDataQuality} data quality
                    </span>
                    <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#F7F8F6] px-3 py-1 text-[11px] font-bold text-black/65">
                      {modalAnalysis.analysisSource === 'AI_ASSISTED' ? 'AI Assisted' : 'Rule Based Review'}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-black/[0.06] bg-[#F7F8F6] px-3 py-1 text-[11px] font-bold text-black/65">
                    Review not started
                  </span>
                )}
              </div>
              <p className="text-[14px] font-medium text-black/55">{compactCategoryLocation(modalLead)}{modalLead.country ? ` • ${modalLead.country}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {modalWebsiteUrl && (
                  <a href={modalWebsiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black hover:bg-black/[0.03]">
                    <Globe size={14} />
                    {getDisplayHost(modalWebsiteUrl)}
                  </a>
                )}
                {modalInstagramUrl && (
                  <a href={modalInstagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black hover:bg-black/[0.03]">
                    <ExternalLink size={14} />
                    @{String(modalLead.instagramUsername || '').replace(/^@/, '') || getDisplayHost(modalInstagramUrl)}
                  </a>
                )}
                {modalFacebookUrl && (
                  <a href={modalFacebookUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black hover:bg-black/[0.03]">
                    <ExternalLink size={14} />
                    Facebook
                  </a>
                )}
                {modalGoogleMapsUrl && (
                  <a href={modalGoogleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-black hover:bg-black/[0.03]">
                    <MapPin size={14} />
                    Open map
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              {!modalAnalysis && !modalIsCatalogLeadWithoutList ? (
                <button
                  type="button"
                  onClick={() => analyzeLead(modalLead)}
                  disabled={analyzingLead === modalTargetId}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-black px-4 text-[13px] font-semibold text-white hover:bg-black/85 disabled:opacity-50"
                >
                  {analyzingLead === modalTargetId ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  Analyze
                </button>
              ) : (modalAnalysis && (modalAnalysis.analysisSource === 'RULE_BASED' || !modalAnalysis.analysisSource) && !modalIsCatalogLeadWithoutList) ? (
                <button
                  type="button"
                  onClick={() => analyzeLead(modalLead, true)}
                  disabled={analyzingLead === modalTargetId}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[13px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {analyzingLead === modalTargetId ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  Re-analyze with AI
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-black/[0.06] bg-white text-black hover:bg-black/[0.03]"
                aria-label="Close lead details"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-black/[0.05] bg-[#F7F8F6] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Score</div>
                  <div className="mt-2 text-2xl font-bold text-black">{modalAnalysis?.opportunityScore ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-black/[0.05] bg-[#F7F8F6] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Contactability</div>
                  <div className="mt-2 text-2xl font-bold text-black">{modalContactabilityDimension ? `${modalContactabilityDimension.value}/100` : (modalLead.phone || modalLead.email ? 'Basic' : '-')}</div>
                </div>
                <div className="rounded-2xl border border-black/[0.05] bg-[#F7F8F6] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Service fit</div>
                  <div className="mt-2 text-2xl font-bold text-black">{modalServiceFitDimension ? `${modalServiceFitDimension.value}/100` : '-'}</div>
                </div>
                <div className="rounded-2xl border border-black/[0.05] bg-[#F7F8F6] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Evidence</div>
                  <div className="mt-2 text-2xl font-bold text-black">{modalEvidenceItems.length || getContactCoverage(modalLead) || '-'}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.05] bg-white p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Suggested service</div>
                      <p className="mt-1 text-[16px] font-semibold text-black">{formatDetailValue(modalAnalysis?.suggestedService, 'Not determined yet')}</p>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Why this lead</div>
                      <p className="mt-2 text-[14px] leading-relaxed text-black/72">{formatDetailValue(modalAnalysis?.outreachAngle, 'Add more verified business evidence before trusting this lead for outreach.')}</p>
                    </div>
                    {modalEvidenceItems.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Evidence found</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modalEvidenceItems.map((item) => (
                            <span key={item} className="rounded-lg border border-black/[0.06] bg-[#F7F8F6] px-2.5 py-1 text-[11px] font-semibold text-black/65">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-black/[0.05] bg-[#FAFAF9] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Outreach draft</div>
                    <div className={`mt-3 rounded-xl border p-4 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      modalAnalysis?.dataQualityLevel === 'LOW'
                        ? 'border-red-100 bg-red-50 text-red-700'
                        : modalAnalysis?.dataQualityLevel === 'MEDIUM'
                          ? 'border-amber-100 bg-amber-50 text-amber-700'
                          : 'border-black/[0.05] bg-white text-black/80'
                    }`}>
                      {!modalAnalysis
                        ? 'Run a review first to generate a draft.'
                        : modalAnalysis.dataQualityLevel === 'LOW'
                          ? 'Draft paused - this lead needs stronger evidence before outreach.'
                          : modalAnalysis.dataQualityLevel === 'MEDIUM'
                            ? (modalAnalysis.messageDraft || 'Needs manual review before outreach.')
                            : (modalAnalysis.messageDraft || 'No outreach draft available.')}
                    </div>
                  </div>
                </div>
              </div>

              {modalIsListItem && (
                <div className="rounded-2xl border border-black/[0.05] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold text-black flex items-center gap-1.5"><FileText size={14} className="text-black/40" /> Notes</h4>
                    {editingNotes !== modalTargetId ? (
                      <button
                        onClick={() => {
                          setNotesValue(modalLead.notes || '');
                          setEditingNotes(modalTargetId);
                        }}
                        className="text-[12px] font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => saveNotes(modalLead)}
                        className="flex items-center gap-1 text-[12px] font-medium text-emerald-600 hover:underline"
                      >
                        <CheckCircle2 size={14} /> Save
                      </button>
                    )}
                  </div>
                  {editingNotes === modalTargetId ? (
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      className="min-h-[96px] w-full rounded-xl border border-black/10 bg-black/[0.01] p-3 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      placeholder="Add your notes here..."
                    />
                  ) : (
                    <p className="text-[13px] leading-relaxed text-black/75 whitespace-pre-wrap">
                      {modalLead.notes || <span className="text-black/30 italic">No notes added.</span>}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-black/[0.05] bg-white p-5">
                <h4 className="mb-4 text-[13px] font-semibold text-black">Links and contacts</h4>
                <div className="space-y-3 text-[13px]">
                  <div className="flex items-start gap-3">
                    <Globe size={16} className="mt-0.5 text-black/45" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Website</div>
                      {modalWebsiteUrl ? <a href={modalWebsiteUrl} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline">{modalWebsiteUrl}</a> : <span className="text-black/45">No website found</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ExternalLink size={16} className="mt-0.5 text-black/45" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Instagram</div>
                      {modalInstagramUrl ? <a href={modalInstagramUrl} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline">{modalInstagramUrl}</a> : <span className="text-black/45">No Instagram link found</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ExternalLink size={16} className="mt-0.5 text-black/45" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Facebook</div>
                      {modalFacebookUrl ? <a href={modalFacebookUrl} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline">{modalFacebookUrl}</a> : <span className="text-black/45">No Facebook link found</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="mt-0.5 text-black/45" />
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Phone</div>
                      <div className="text-black/80">{formatDetailValue(modalLead.phone, 'No phone found')}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="mt-0.5 text-black/45" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Email</div>
                      <div className="break-all text-black/80">{formatDetailValue(modalLead.email, 'No email found')}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="mt-0.5 text-black/45" />
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Address</div>
                      <div className="text-black/80">{formatDetailValue(modalLead.address, 'No address found')}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.05] bg-white p-5">
                <h4 className="mb-4 text-[13px] font-semibold text-black">Score dimensions</h4>
                {modalAnalysis?.scoreDimensions?.length ? (
                  <div className="space-y-3">
                    {modalAnalysis.scoreDimensions.slice(0, 7).map((dimension) => (
                      <div key={dimension.key || dimension.label}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                          <span className="font-semibold text-black/70">{dimension.label}</span>
                          <span className="font-bold text-black">{dimension.value}/100</span>
                        </div>
                        <div className="h-2 rounded-full bg-black/[0.06]">
                          <div className="h-full rounded-full bg-[#B6FF00]" style={{ width: `${Math.max(4, Math.min(100, dimension.value || 0))}%` }} />
                        </div>
                        {dimension.reason && <p className="mt-1 text-[11px] leading-relaxed text-black/45">{dimension.reason}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-black/45">Run a review to populate score dimensions.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default DashboardLeadListsPage;
