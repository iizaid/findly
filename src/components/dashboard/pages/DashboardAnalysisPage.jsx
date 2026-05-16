import { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  Loader2,
  MapPin,
  MessageSquareText,
  Phone,
  Radar,
  Send,
  Sparkles,
  Star,
  Tag,
  AlertCircle,
} from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest } from '../../../lib/api';

const signalLabels = {
  NO_WEBSITE: { label: 'No website', color: 'bg-red-100 text-red-800' },
  HAS_WEBSITE: { label: 'Has website', color: 'bg-green-100 text-green-800' },
  HIGH_RATING: { label: 'High rating', color: 'bg-yellow-100 text-yellow-800' },
  HAS_GOOGLE_RATING: { label: 'Google rated', color: 'bg-blue-100 text-blue-800' },
  HIGH_REVIEW_COUNT: { label: 'Many reviews', color: 'bg-purple-100 text-purple-800' },
  LOW_REVIEW_COUNT: { label: 'Few reviews', color: 'bg-orange-100 text-orange-800' },
  HAS_PHONE: { label: 'Phone listed', color: 'bg-emerald-100 text-emerald-800' },
  FOOD_BUSINESS: { label: 'Food / café', color: 'bg-amber-100 text-amber-800' },
  NEEDS_WEBSITE_DEVELOPMENT: { label: 'Needs website', color: 'bg-red-100 text-red-800' },
  NEEDS_DIGITAL_MENU_POSSIBLE: { label: 'Needs digital menu', color: 'bg-pink-100 text-pink-800' },
};

const scoreColor = (level) => {
  if (level === 'GOLD') return 'from-yellow-400 to-amber-500';
  if (level === 'HIGH') return 'from-green-400 to-emerald-500';
  if (level === 'MEDIUM') return 'from-blue-400 to-indigo-500';
  return 'from-gray-300 to-gray-400';
};

const scoreBorder = (level) => {
  if (level === 'GOLD') return 'border-yellow-300';
  if (level === 'HIGH') return 'border-green-300';
  if (level === 'MEDIUM') return 'border-blue-300';
  return 'border-gray-200';
};

const buildMessageDraft = (detail, analysis) => {
  if (!detail || !analysis) return '';
  const intro = !detail.websiteUrl
    ? `I noticed you don't have a website yet — but your ${detail.rating ? `${detail.rating}-star rating` : 'Google presence'} shows you're clearly doing great work. A simple, professional website could help you show up in more nearby searches and convert more visitors into customers.`
    : `I came across your business on Google${detail.rating ? ` and noticed your impressive ${detail.rating}-star rating` : ''}. ${analysis.outreachAngle || ''}`.trim();

  return [
    `Hi ${detail.businessName},`,
    '',
    intro,
    '',
    `I specialize in ${analysis.suggestedService?.toLowerCase() || 'digital services'} for businesses like yours. Would you be open to a quick chat this week?`,
    '',
    'Best regards',
  ].join('\n');
};

const DashboardAnalysisPage = ({ onNavigate }) => {
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [copyState, setCopyState] = useState('idle');

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        setIsLoading(true);
        const res = await apiRequest('/api/search/leads');
        const allLeads = res.data.leads || [];
        // Only show leads that have at least one analysis
        const analyzed = allLeads.filter((l) => l.analyses && l.analyses.length > 0);
        setLeads(analyzed);
      } catch (err) {
        setError(err.message || 'Failed to load leads');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeads();
  }, []);

  useEffect(() => {
    setCopyState('idle');
  }, [selectedLead]);

  const loadDetail = useCallback(async (leadId) => {
    setIsLoadingDetail(true);
    setSelectedLead(leadId);
    try {
      const res = await apiRequest(`/api/search/leads/${leadId}`);
      setDetail(res.data.lead || null);
    } catch (err) {
      setError(err.message || 'Failed to load lead detail');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const analysis = detail?.analyses?.[0];
  const messageDraft = buildMessageDraft(detail, analysis);

  // List view (no lead selected or mobile)
  if (!selectedLead) {
    return (
      <div className="min-h-[calc(100vh-132px)]">
        <DashboardCard className="p-5 md:p-7">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
            <Sparkles size={26} />
          </div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Lead analysis</p>
          <h2 className="mt-3 text-4xl font-bold tracking-tighter md:text-5xl">Analysis Deep Dive</h2>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-secondary">
            Select any analyzed lead to view its full scoring breakdown, detected signals, suggested service, and outreach strategy.
          </p>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="mt-10 flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-secondary" />
            </div>
          ) : leads.length === 0 ? (
            <div className="mt-7">
              <DashboardEmptyState
                title="No analyzed leads yet"
                description="Analyze leads from Lead Lists first, then they will appear here."
                actionLabel="Create Search Campaign"
                onAction={() => onNavigate('/dashboard/find-leads')}
              />
            </div>
          ) : (
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {leads.map((lead) => {
                const a = lead.analyses[0];
                return (
                  <button
                    type="button"
                    key={lead.id}
                    onClick={() => loadDetail(lead.id)}
                    className="group flex flex-col rounded-[22px] border border-black/[0.08] bg-[#F7F8F6] p-5 text-left transition-all duration-200 hover:border-black/15 hover:bg-white hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{lead.businessName}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-secondary">{lead.category || lead.city || 'Business'}</p>
                      </div>
                      {a && (
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${scoreColor(a.scoreLevel)}`}>
                          {a.opportunityScore}
                        </span>
                      )}
                    </div>
                    {a?.detectedSignals?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1">
                        {a.detectedSignals.slice(0, 3).map((s) => {
                          const info = signalLabels[s] || { label: s.replace(/_/g, ' '), color: 'bg-gray-100 text-gray-700' };
                          return (
                            <span key={s} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${info.color}`}>
                              {info.label}
                            </span>
                          );
                        })}
                        {a.detectedSignals.length > 3 && (
                          <span className="text-[10px] font-bold text-secondary">+{a.detectedSignals.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-1 text-xs font-bold text-secondary transition-colors group-hover:text-black">
                      View analysis <ArrowRight size={12} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardCard>
      </div>
    );
  }

  // Detail view
  return (
    <div className="min-h-[calc(100vh-132px)] space-y-5">
      {/* Back button */}
      <button
        type="button"
        onClick={() => { setSelectedLead(null); setDetail(null); }}
        className="inline-flex items-center gap-2 text-sm font-bold text-secondary transition-colors hover:text-black"
      >
        <ChevronLeft size={16} /> Back to all leads
      </button>

      {isLoadingDetail ? (
        <DashboardCard className="flex min-h-[400px] items-center justify-center p-7">
          <Loader2 size={28} className="animate-spin text-secondary" />
        </DashboardCard>
      ) : !detail ? (
        <DashboardCard className="p-7">
          <p className="text-sm font-bold text-red-600">Could not load lead details.</p>
        </DashboardCard>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
          {/* Left: Business info + Score */}
          <div className="space-y-5">
            {/* Business header */}
            <DashboardCard className="p-5 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Business profile</p>
                  <h2 className="mt-3 text-3xl font-bold tracking-tighter md:text-4xl">{detail.businessName}</h2>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-secondary">
                    {detail.category && (
                      <span className="inline-flex items-center gap-1.5"><Tag size={14} /> {detail.category}</span>
                    )}
                    {detail.city && (
                      <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {detail.city}{detail.country ? `, ${detail.country}` : ''}</span>
                    )}
                    {detail.rating && (
                      <span className="inline-flex items-center gap-1.5"><Star size={14} /> {detail.rating}★ ({detail.reviewCount || 0} reviews)</span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {detail.websiteUrl && (
                      <a href={detail.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F7F8F6] px-4 py-2 text-xs font-bold transition-colors hover:bg-white">
                        <Globe size={14} /> Website <ExternalLink size={11} />
                      </a>
                    )}
                    {detail.phone && (
                      <a href={`tel:${detail.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F7F8F6] px-4 py-2 text-xs font-bold transition-colors hover:bg-white">
                        <Phone size={14} /> {detail.phone}
                      </a>
                    )}
                    {detail.googleMapsUrl && (
                      <a href={detail.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#F7F8F6] px-4 py-2 text-xs font-bold transition-colors hover:bg-white">
                        <MapPin size={14} /> Google Maps <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Score circle */}
                {analysis && (
                  <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl border-2 bg-gradient-to-br text-white ${scoreColor(analysis.scoreLevel)} ${scoreBorder(analysis.scoreLevel)}`}>
                    <span className="text-3xl font-black leading-none">{analysis.opportunityScore}</span>
                    <span className="mt-1 text-[9px] font-bold uppercase tracking-wider opacity-80">{analysis.scoreLevel}</span>
                  </div>
                )}
              </div>
            </DashboardCard>

            {/* Detected Signals */}
            {analysis && (
              <DashboardCard className="p-5 md:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Detected Signals</p>
                    <p className="text-xs font-semibold text-secondary">{analysis.detectedSignals?.length || 0} signals found from public data</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {analysis.detectedSignals?.map((s) => {
                    const info = signalLabels[s] || { label: s.replace(/_/g, ' '), color: 'bg-gray-100 text-gray-700' };
                    return (
                      <span key={s} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${info.color}`}>
                        {info.label}
                      </span>
                    );
                  })}
                </div>
              </DashboardCard>
            )}

            {/* Scoring Reasons */}
            {analysis?.reasons?.length > 0 && (
              <DashboardCard className="p-5 md:p-7">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black">
                    <Gauge size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Scoring Breakdown</p>
                    <p className="text-xs font-semibold text-secondary">Why this lead scored {analysis.opportunityScore}/100</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-3">
                  {analysis.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl bg-[#F7F8F6] p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-black text-black">{i + 1}</span>
                      <p className="text-sm font-semibold leading-6 text-black">{reason}</p>
                    </li>
                  ))}
                </ul>
              </DashboardCard>
            )}
          </div>

          {/* Right: Suggested service + Outreach */}
          <div className="space-y-5">
            {/* Suggested Service */}
            {analysis?.suggestedService && (
              <DashboardCard className="p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black">
                    <FileText size={18} />
                  </span>
                  <p className="text-sm font-bold">Suggested Service</p>
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight">{analysis.suggestedService}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-secondary">
                  Based on the detected signals, this is the most relevant service to offer this business.
                </p>
              </DashboardCard>
            )}

            {/* Outreach Angle */}
            {analysis?.outreachAngle && (
              <DashboardCard className="p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black">
                    <Send size={18} />
                  </span>
                  <p className="text-sm font-bold">Outreach Angle</p>
                </div>
                <p className="mt-4 text-sm font-semibold leading-7">{analysis.outreachAngle}</p>
              </DashboardCard>
            )}

            {/* Message Draft */}
            {analysis && (
              <DashboardCard className="!bg-black p-5 text-white md:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                    <MessageSquareText size={18} />
                  </span>
                  <p className="text-sm font-bold">Message Draft</p>
                </div>
                <div className="mt-4 whitespace-pre-line rounded-2xl bg-white/[0.06] p-5 text-sm font-semibold leading-7 text-white/80">
                  {messageDraft}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(messageDraft);
                      setCopyState('copied');
                      window.setTimeout(() => setCopyState('idle'), 1600);
                    } catch {
                      setError('Could not copy the message. Please copy it manually.');
                    }
                  }}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-bold text-black transition-colors hover:bg-accent"
                >
                  {copyState === 'copied' ? 'Copied' : 'Copy message'}
                </button>
              </DashboardCard>
            )}

            {/* Opportunity Score Card */}
            {analysis && (
              <DashboardCard className="p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black">
                    <Radar size={18} />
                  </span>
                  <p className="text-sm font-bold">Opportunity Score</p>
                </div>
                <div className="mt-5">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${scoreColor(analysis.scoreLevel)} transition-all duration-700`}
                      style={{ width: `${analysis.opportunityScore}%` }}
                    />
                  </div>
                  <div className="mt-3 flex justify-between text-xs font-bold text-secondary">
                    <span>0</span>
                    <span className="text-black">{analysis.opportunityScore} / 100</span>
                    <span>100</span>
                  </div>
                </div>
              </DashboardCard>
            )}

            {/* Lead Status */}
            <DashboardCard className="p-5 md:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-secondary">Lead status</p>
              <p className="mt-2 text-sm font-bold">{detail.status}</p>
              <p className="mt-1 text-xs font-semibold text-secondary">
                Source: {detail.source?.replace('_', ' ')} · List: {detail.leadList?.name || '-'}
              </p>
            </DashboardCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardAnalysisPage;
