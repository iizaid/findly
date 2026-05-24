import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Sparkles,
  Tag,
} from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest } from '../../../lib/api';
import { safeExternalUrl } from '../../../lib/urlSafety';
import useGsapPageReveal from '../../../hooks/useGsapPageReveal';

const findingLabels = {
  NO_WEBSITE: { label: 'No website', tone: 'bg-red-100 text-red-700' },
  HAS_WEBSITE: { label: 'Website found', tone: 'bg-emerald-100 text-emerald-700' },
  HIGH_RATING: { label: 'High rating', tone: 'bg-amber-100 text-amber-700' },
  HAS_GOOGLE_RATING: { label: 'Public rating', tone: 'bg-blue-100 text-blue-700' },
  HIGH_REVIEW_COUNT: { label: 'Many reviews', tone: 'bg-violet-100 text-violet-700' },
  LOW_REVIEW_COUNT: { label: 'Few reviews', tone: 'bg-orange-100 text-orange-700' },
  HAS_PHONE: { label: 'Phone listed', tone: 'bg-emerald-100 text-emerald-700' },
  HAS_EMAIL: { label: 'Email listed', tone: 'bg-cyan-100 text-cyan-700' },
  HAS_SOCIAL: { label: 'Public social links', tone: 'bg-pink-100 text-pink-700' },
  NEEDS_WEBSITE_DEVELOPMENT: { label: 'Website opportunity', tone: 'bg-red-100 text-red-700' },
  NEEDS_DIGITAL_MENU_POSSIBLE: { label: 'Menu opportunity', tone: 'bg-fuchsia-100 text-fuchsia-700' },
};

const sourceLabel = (analysis) => {
  if (!analysis) return 'Rule Based Review';
  if (analysis.analysisSource === 'AI_ASSISTED') return 'AI Assisted';
  if (analysis.analysisSource === 'HYBRID') return 'Hybrid Review';
  return 'Rule Based Review';
};

const qualityMeta = (level) => {
  if (level === 'HIGH') {
    return {
      label: 'High data quality',
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };
  }
  if (level === 'MEDIUM') {
    return {
      label: 'Medium data quality',
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
    };
  }
  return {
    label: 'Needs more evidence',
    tone: 'bg-red-50 text-red-700 border-red-100',
  };
};

const scoreMeta = (score) => {
  if (score >= 75) return { label: 'High', tone: 'bg-[#B6FF00] text-black' };
  if (score >= 50) return { label: 'Medium', tone: 'bg-lime-100 text-black' };
  return { label: 'Low', tone: 'bg-black/[0.06] text-black/70' };
};

const buildContactItems = (detail) => {
  const items = [
    { key: 'phone', label: 'Phone', value: detail?.phone, href: detail?.phone ? `tel:${detail.phone}` : null, copyValue: detail?.phone },
    { key: 'email', label: 'Email', value: detail?.email, href: detail?.email ? `mailto:${detail.email}` : null, copyValue: detail?.email },
    { key: 'website', label: 'Website', value: detail?.websiteUrl, href: safeExternalUrl(detail?.websiteUrl), copyValue: detail?.websiteUrl },
    { key: 'instagram', label: 'Instagram', value: detail?.instagramUrl, href: safeExternalUrl(detail?.instagramUrl), copyValue: detail?.instagramUrl },
    { key: 'facebook', label: 'Facebook', value: detail?.facebookUrl, href: safeExternalUrl(detail?.facebookUrl), copyValue: detail?.facebookUrl },
    { key: 'googleMaps', label: 'Google Maps', value: detail?.googleMapsUrl, href: safeExternalUrl(detail?.googleMapsUrl), copyValue: detail?.googleMapsUrl },
  ];

  return items.filter((item) => item.value || item.href);
};

const buildEvidenceRows = (detail, analysis) => {
  const rows = [];
  if (detail?.address) {
    rows.push({
      label: 'Address',
      value: detail.address,
      confidence: detail.latitude && detail.longitude ? 'High' : 'Medium',
      source: detail.googleMapsUrl || detail.websiteUrl || null,
    });
  }
  if (detail?.websiteUrl) {
    rows.push({
      label: 'Official website',
      value: detail.websiteUrl,
      confidence: 'High',
      source: detail.websiteUrl,
    });
  }
  if (detail?.phone) {
    rows.push({
      label: 'Public phone',
      value: detail.phone,
      confidence: 'High',
      source: detail.websiteUrl || detail.googleMapsUrl || null,
    });
  }
  if (detail?.email) {
    rows.push({
      label: 'Public email',
      value: detail.email,
      confidence: 'High',
      source: detail.websiteUrl || null,
    });
  }
  if (detail?.instagramUrl) {
    rows.push({
      label: 'Instagram profile',
      value: detail.instagramUrl,
      confidence: 'Medium',
      source: detail.instagramUrl,
    });
  }
  if (detail?.facebookUrl) {
    rows.push({
      label: 'Facebook profile',
      value: detail.facebookUrl,
      confidence: 'Medium',
      source: detail.facebookUrl,
    });
  }
  if (analysis?.reasons?.length) {
    analysis.reasons.slice(0, 4).forEach((reason, index) => {
      rows.push({
        label: `Review note ${index + 1}`,
        value: reason,
        confidence: 'Medium',
        source: null,
      });
    });
  }

  return rows.slice(0, 8);
};

const buildMissingEvidence = (detail, analysis) => {
  const items = [];
  if (!detail?.address) items.push('Street address');
  if (!detail?.phone) items.push('Phone number');
  if (!detail?.email) items.push('Email');
  if (!detail?.websiteUrl) items.push('Official website');
  if (!detail?.latitude || !detail?.longitude) items.push('Reliable coordinates');

  const outreachDimension = analysis?.scoreDimensions?.find((item) => item.key === 'outreach_readiness');
  if ((outreachDimension?.value ?? 0) < 65) items.push('Stronger outreach evidence');

  return [...new Set(items)];
};

const getOutreachState = (detail, analysis) => {
  const level = analysis?.dataQualityLevel || 'LOW';
  const outreachDimension = analysis?.scoreDimensions?.find((item) => item.key === 'outreach_readiness');
  const ready = (outreachDimension?.value ?? 0) >= 65 || level === 'HIGH';

  if (level === 'LOW') {
    return {
      ready: false,
      title: 'Draft paused',
      subtitle: 'This lead needs stronger evidence before outreach.',
      body: 'Add more public contact or location evidence before generating a confident outreach draft.',
      className: 'bg-red-50 text-red-700 border-red-100',
    };
  }

  if (level === 'MEDIUM' && !ready) {
    return {
      ready: false,
      title: 'Needs manual review',
      subtitle: 'This draft should be reviewed before use.',
      body: analysis?.messageDraft || 'Public evidence is partial. Review the lead before sending outreach.',
      className: 'bg-amber-50 text-amber-700 border-amber-100',
    };
  }

  return {
    ready: true,
    title: 'Outreach ready',
    subtitle: 'The draft uses verified public evidence.',
    body: analysis?.messageDraft || `Hi ${detail?.businessName || 'there'},\n\nI reviewed your public business details and identified a clear service opportunity.\n\nBest regards`,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
};

const dimensionGroups = [
  { title: 'Identity', keys: ['business_identity_confidence', 'data_quality', 'source_reliability'] },
  { title: 'Location', keys: ['location_confidence', 'location_match', 'geo_readiness'] },
  { title: 'Fit', keys: ['category_fit', 'service_fit', 'category_urgency'] },
  { title: 'Digital gap', keys: ['website_gap', 'website_quality', 'commerce_need'] },
  { title: 'Reachability', keys: ['contact_path', 'social_presence', 'outreach_readiness'] },
];

const buildGroupedDimensions = (analysis) => {
  const dimensions = Array.isArray(analysis?.scoreDimensions) ? analysis.scoreDimensions : [];
  return dimensionGroups
    .map((group) => ({
      ...group,
      items: dimensions.filter((item) => group.keys.includes(item.key)),
    }))
    .filter((group) => group.items.length > 0);
};

const filterByContactability = (lead, filter) => {
  if (!filter) return true;
  if (filter === 'phone') return !!lead.phone;
  if (filter === 'email') return !!lead.email;
  if (filter === 'website') return !!lead.websiteUrl;
  if (filter === 'social') return !!(lead.instagramUrl || lead.facebookUrl);
  return true;
};

const DashboardAnalysisPage = ({ onNavigate }) => {
  const pageRef = useRef(null);
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [copyState, setCopyState] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('');
  const [contactFilter, setContactFilter] = useState('');

  useGsapPageReveal(pageRef);

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setIsLoading(true);
        const res = await apiRequest('/api/search/leads');
        const allLeads = res.data?.leads || [];
        const analyzed = allLeads.filter((lead) => Array.isArray(lead.analyses) && lead.analyses.length > 0);
        setLeads(analyzed);
      } catch (err) {
        setError(err.message || 'Failed to load analysis.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeads();
  }, []);

  useEffect(() => {
    setCopyState('');
  }, [selectedLead]);

  const loadDetail = useCallback(async (leadId) => {
    setIsLoadingDetail(true);
    setSelectedLead(leadId);
    setError(null);
    try {
      const res = await apiRequest(`/api/search/leads/${leadId}`);
      setDetail(res.data?.lead || null);
    } catch (err) {
      setError(err.message || 'Failed to load lead detail.');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const analysis = lead.analyses?.[0];
    const score = Number(analysis?.opportunityScore || 0);
    const readiness = (analysis?.scoreDimensions || []).find((item) => item.key === 'outreach_readiness')?.value || 0;

    if (qualityFilter && analysis?.dataQualityLevel !== qualityFilter) return false;
    if (scoreFilter === 'HIGH' && score < 75) return false;
    if (scoreFilter === 'MEDIUM' && (score < 50 || score >= 75)) return false;
    if (scoreFilter === 'LOW' && score >= 50) return false;
    if (readinessFilter === 'READY' && readiness < 65) return false;
    if (readinessFilter === 'NEEDS_EVIDENCE' && readiness >= 65) return false;
    if (!filterByContactability(lead, contactFilter)) return false;
    return true;
  }), [leads, qualityFilter, scoreFilter, readinessFilter, contactFilter]);

  const summary = useMemo(() => {
    const rows = filteredLeads.map((lead) => lead.analyses?.[0]).filter(Boolean);
    const totalAnalyzed = rows.length;
    const readyCount = rows.filter((analysis) => {
      const readiness = analysis.scoreDimensions?.find((item) => item.key === 'outreach_readiness')?.value || 0;
      return readiness >= 65;
    }).length;
    const aiAssisted = rows.filter((analysis) => analysis.analysisSource === 'AI_ASSISTED' || analysis.analysisSource === 'HYBRID').length;
    const ruleBased = rows.filter((analysis) => !['AI_ASSISTED', 'HYBRID'].includes(analysis.analysisSource)).length;
    const averageScore = totalAnalyzed
      ? Math.round(rows.reduce((sum, analysis) => sum + (analysis.opportunityScore || 0), 0) / totalAnalyzed)
      : 0;

    return {
      totalAnalyzed,
      readyCount,
      needsEvidence: totalAnalyzed - readyCount,
      aiAssisted,
      ruleBased,
      averageScore,
    };
  }, [filteredLeads]);

  const analysis = detail?.analyses?.[0] || null;
  const quality = qualityMeta(analysis?.dataQualityLevel);
  const outreachState = getOutreachState(detail, analysis);
  const groupedDimensions = buildGroupedDimensions(analysis);
  const evidenceRows = buildEvidenceRows(detail, analysis);
  const contactItems = buildContactItems(detail);
  const missingEvidence = buildMissingEvidence(detail, analysis);

  const copyValue = async (value, label) => {
    if (!value || !navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(value);
    setCopyState(`${label} copied`);
    window.setTimeout(() => setCopyState(''), 1200);
  };

  if (!selectedLead) {
    return (
      <div ref={pageRef} className="min-h-[calc(100vh-132px)]" data-gsap-reveal>
        <DashboardCard className="p-5 md:p-7">
          <div className="flex flex-col gap-6 border-b border-black/[0.06] pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Analysis</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-black md:text-4xl">Lead intelligence</h2>
              <p className="mt-3 max-w-3xl text-[14px] font-semibold leading-6 text-black/55">
                Review evidence quality, contactability, outreach readiness, and score breakdowns without depending on AI availability.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-gsap-stagger>
              <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black outline-none">
                <option value="">All data quality</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black outline-none">
                <option value="">All scores</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black outline-none">
                <option value="">All outreach states</option>
                <option value="READY">Ready</option>
                <option value="NEEDS_EVIDENCE">Needs evidence</option>
              </select>
              <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black outline-none">
                <option value="">All contact paths</option>
                <option value="phone">Has phone</option>
                <option value="email">Has email</option>
                <option value="website">Has website</option>
                <option value="social">Has social</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700" data-gsap-stagger>
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6" data-gsap-stagger>
            {[
              ['Total analyzed', summary.totalAnalyzed],
              ['Outreach ready', summary.readyCount],
              ['Needs evidence', summary.needsEvidence],
              ['AI assisted', summary.aiAssisted],
              ['Rule based', summary.ruleBased],
              ['Average score', summary.averageScore],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">{label}</p>
                <p className="mt-2 text-2xl font-bold text-black">{value}</p>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-10 flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-secondary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="mt-8">
              <DashboardEmptyState
                title="No analyzed leads yet"
                description="Analyze leads from Lead Lists first, then review them here."
                actionLabel="Open lead lists"
                onAction={() => onNavigate('/dashboard/lead-lists')}
              />
            </div>
          ) : (
            <div className="mt-8 overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-sm ring-1 ring-black/5" data-gsap-stagger>
              <div className="hidden grid-cols-[minmax(0,1.5fr)_0.9fr_0.7fr_1.1fr_1.1fr_0.8fr_0.8fr] gap-3 border-b border-black/[0.05] bg-[#FBFBFB] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-black/45 lg:grid">
                <span>Business</span>
                <span>Location</span>
                <span>Score</span>
                <span>Quality</span>
                <span>Contactability</span>
                <span>Action</span>
                <span>Review</span>
              </div>
              <div className="divide-y divide-black/[0.06]">
                {filteredLeads.map((lead) => {
                  const itemAnalysis = lead.analyses?.[0];
                  const itemQuality = qualityMeta(itemAnalysis?.dataQualityLevel);
                  const itemScore = scoreMeta(itemAnalysis?.opportunityScore || 0);
                  const itemFindings = (itemAnalysis?.detectedSignals || [])
                    .map((item) => findingLabels[item])
                    .filter(Boolean)
                    .slice(0, 3);
                  const readiness = itemAnalysis?.scoreDimensions?.find((item) => item.key === 'outreach_readiness')?.value || 0;
                  const contactability = [
                    lead.phone && 'Phone',
                    lead.email && 'Email',
                    lead.websiteUrl && 'Website',
                    (lead.instagramUrl || lead.facebookUrl) && 'Social',
                  ].filter(Boolean);

                  return (
                    <button
                      type="button"
                      key={lead.id}
                      onClick={() => loadDetail(lead.id)}
                      className="grid w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA] lg:grid-cols-[minmax(0,1.5fr)_0.9fr_0.7fr_1.1fr_1.1fr_0.8fr_0.8fr]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-bold text-black">{lead.businessName}</p>
                            <p className="mt-1 truncate text-[12px] font-semibold text-black/50">{lead.category || 'Business'}</p>
                          </div>
                          <span className="inline-flex rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/60 lg:hidden">
                            {sourceLabel(itemAnalysis)}
                          </span>
                        </div>
                        {itemFindings.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {itemFindings.map((item) => (
                              <span key={item.label} className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${item.tone}`}>
                                {item.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-[12px] font-semibold text-black/55">
                        {[lead.city, lead.country].filter(Boolean).join(', ') || 'Location pending'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex min-w-[46px] items-center justify-center rounded-2xl px-3 py-2 text-[13px] font-black ${itemScore.tone}`}>
                          {itemAnalysis?.opportunityScore ?? 0}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/45">{itemScore.label}</span>
                      </div>
                      <div>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${itemQuality.tone}`}>
                          {itemQuality.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {contactability.length ? contactability.map((item) => (
                          <span key={item} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/60">
                            {item}
                          </span>
                        )) : (
                          <span className="text-[12px] font-semibold text-black/45">Needs contact proof</span>
                        )}
                      </div>
                      <div className="text-[12px] font-semibold text-black/55">
                        {readiness >= 65 ? 'Ready for outreach' : 'Needs evidence'}
                      </div>
                      <div className="inline-flex items-center gap-2 text-[12px] font-bold text-black">
                        View intelligence
                        <ArrowRight size={14} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="min-h-[calc(100vh-132px)] space-y-5" data-gsap-reveal>
      <button
        type="button"
        onClick={() => {
          setSelectedLead(null);
          setDetail(null);
        }}
        className="inline-flex items-center gap-2 text-sm font-bold text-secondary transition-colors hover:text-black"
        data-gsap-stagger
      >
        <ChevronLeft size={16} />
        Back to all leads
      </button>

      {isLoadingDetail ? (
        <DashboardCard className="flex min-h-[420px] items-center justify-center p-7">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </DashboardCard>
      ) : !detail ? (
        <DashboardCard className="p-7">
          <p className="text-sm font-bold text-red-600">Could not load lead details.</p>
        </DashboardCard>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="space-y-5">
            <DashboardCard className="p-5 md:p-7" data-gsap-stagger>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Business intelligence</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-black md:text-4xl">{detail.businessName}</h2>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-black/55">
                    {detail.category && <span className="inline-flex items-center gap-1.5"><Tag size={14} /> {detail.category}</span>}
                    {(detail.city || detail.country) && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {[detail.city, detail.country].filter(Boolean).join(', ')}</span>}
                    <span className="inline-flex items-center gap-1.5"><Gauge size={14} /> {sourceLabel(analysis)}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${quality.tone}`}>{quality.label}</span>
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${scoreMeta(analysis?.opportunityScore || 0).tone}`}>
                      Score {analysis?.opportunityScore || 0}
                    </span>
                    {(analysis?.detectedSignals || []).slice(0, 4).map((item) => {
                      const finding = findingLabels[item];
                      if (!finding) return null;
                      return (
                        <span key={item} className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${finding.tone}`}>
                          {finding.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">Recommended service</p>
                    <p className="mt-2 text-[15px] font-bold text-black">{analysis?.suggestedService || 'Review required'}</p>
                  </div>
                  <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">Next action</p>
                    <p className="mt-2 text-[15px] font-bold text-black">{analysis?.nextBestAction || 'Review lead details'}</p>
                  </div>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-7" data-gsap-stagger>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#B6FF00] text-black">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Opportunity decision</p>
                  <h3 className="mt-1 text-xl font-bold text-black">Why this lead matters</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">Reasoning summary</p>
                  <p className="mt-2 text-[14px] font-semibold leading-6 text-black/70">
                    {analysis?.outreachAngle || 'Public evidence is still limited. Review the evidence pack before deciding on outreach.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">Confidence</p>
                  <p className="mt-2 text-[14px] font-semibold leading-6 text-black/70">
                    {analysis?.confidence ? `${analysis.confidence[0].toUpperCase()}${analysis.confidence.slice(1)} confidence` : 'Rule based confidence'} based on the current evidence pack.
                  </p>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-7" data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Evidence pack</p>
              <div className="mt-5 space-y-3">
                {evidenceRows.length ? evidenceRows.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-black/[0.06] bg-[#FAFAFA] p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-black">{item.label}</p>
                        <p className="mt-1 break-words text-[13px] font-semibold leading-6 text-black/65">{item.value}</p>
                      </div>
                      <span className="inline-flex rounded-full bg-black/[0.05] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/60">
                        {item.confidence}
                      </span>
                    </div>
                    {item.source && (
                      <a href={safeExternalUrl(item.source) || item.source} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-[12px] font-bold text-black/65 hover:text-black">
                        Review source
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                )) : (
                  <p className="text-[13px] font-semibold text-black/55">This lead still needs more public evidence.</p>
                )}
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-7" data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Score dimensions</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {groupedDimensions.map((group) => (
                  <div key={group.title} className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-black/50">{group.title}</p>
                    <div className="mt-4 space-y-3">
                      {group.items.map((item) => (
                        <div key={item.key}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-[13px] font-bold text-black">{item.label}</span>
                            <span className="text-[12px] font-semibold text-black/55">{item.value}/100</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                            <div className="h-full rounded-full bg-[#B6FF00]" style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} data-gsap-bar data-gsap-bar-width={`${Math.max(0, Math.min(100, item.value))}%`} />
                          </div>
                          <p className="mt-1 text-[12px] font-semibold leading-5 text-black/50">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>

          <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <DashboardCard className="p-5 md:p-6" data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Contact card</p>
              <div className="mt-4 space-y-3">
                {contactItems.length ? contactItems.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-black/45">{item.label}</p>
                        <p className="mt-1 break-words text-[13px] font-semibold text-black">{item.value}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.copyValue && (
                          <button type="button" onClick={() => copyValue(item.copyValue, item.label)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white text-black/60 transition-colors hover:text-black">
                            <Copy size={14} />
                          </button>
                        )}
                        {item.href && (
                          <a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white text-black/60 transition-colors hover:text-black">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-[13px] font-semibold text-black/55">Public contact details are still incomplete.</p>
                )}
              </div>
              {copyState && (
                <p className="mt-4 text-[12px] font-bold text-emerald-700">{copyState}</p>
              )}
            </DashboardCard>

            <DashboardCard className="p-5 md:p-6" data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Outreach readiness</p>
              <div className={`mt-4 rounded-2xl border p-4 ${outreachState.className}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <BadgeCheck size={18} />
                  </div>
                  <div>
                    <p className="text-[14px] font-bold">{outreachState.title}</p>
                    <p className="mt-1 text-[13px] font-semibold opacity-80">{outreachState.subtitle}</p>
                  </div>
                </div>
              </div>
              {missingEvidence.length > 0 && (
                <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/45">Still missing</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {missingEvidence.map((item) => (
                      <span key={item} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/60">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </DashboardCard>

            <DashboardCard className="p-5 md:p-6" data-gsap-stagger>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
                  <MessageSquareText size={18} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Outreach draft</p>
                  <p className="text-[13px] font-semibold text-black/50">{sourceLabel(analysis)}</p>
                </div>
              </div>
              <div className={`mt-4 rounded-2xl border p-4 ${outreachState.className}`}>
                <p className="text-[13px] font-bold">{outreachState.title}</p>
                <p className="mt-2 whitespace-pre-line text-[13px] font-semibold leading-6 opacity-90">{outreachState.body}</p>
              </div>
            </DashboardCard>

            <DashboardCard className="p-5 md:p-6" data-gsap-stagger>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Quick actions</p>
              <div className="mt-4 grid gap-2">
                {detail?.phone && (
                  <button type="button" onClick={() => copyValue(detail.phone, 'Phone')} className="inline-flex h-11 items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-[#FAFAFA]">
                    <span className="inline-flex items-center gap-2"><Phone size={15} /> Copy phone</span>
                    <Copy size={14} />
                  </button>
                )}
                {detail?.email && (
                  <button type="button" onClick={() => copyValue(detail.email, 'Email')} className="inline-flex h-11 items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-[#FAFAFA]">
                    <span className="inline-flex items-center gap-2"><Mail size={15} /> Copy email</span>
                    <Copy size={14} />
                  </button>
                )}
                {safeExternalUrl(detail?.websiteUrl) && (
                  <a href={safeExternalUrl(detail.websiteUrl)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-[#FAFAFA]">
                    <span className="inline-flex items-center gap-2"><Globe size={15} /> Open website</span>
                    <ExternalLink size={14} />
                  </a>
                )}
                {safeExternalUrl(detail?.instagramUrl) && (
                  <a href={safeExternalUrl(detail.instagramUrl)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-[#FAFAFA]">
                    <span className="inline-flex items-center gap-2"><ExternalLink size={15} /> Open Instagram</span>
                    <ArrowRight size={14} />
                  </a>
                )}
              </div>
            </DashboardCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardAnalysisPage;
