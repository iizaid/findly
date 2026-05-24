import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PLATFORM_LABELS } from './searchConfig';

const layerLabel = (key) => ({
  CACHE_EVIDENCE: 'Cached evidence',
  LOCAL_DATASET: 'Local data',
  WEBSITE_OPEN_WEB: 'Website and open web',
  SEARCH_METADATA: 'Search Metadata',
  GOOGLE_PLACES: 'Google Places',
  FUTURE_PROVIDER: 'Future provider',
}[key] || key);

const SearchResultSummary = ({ resultSummary, onNavigate, onStartNew }) => {
  const hasResults = resultSummary.count > 0;
  const requestedLimit = resultSummary.requestedLimit ?? resultSummary.count ?? 0;
  const foundCount = resultSummary.foundCount ?? resultSummary.count ?? 0;
  const acceptedCount = resultSummary.acceptedCount ?? resultSummary.count ?? 0;
  const shortfallCount = resultSummary.shortfallCount ?? Math.max(0, requestedLimit - acceptedCount);
  const rejectedCount = resultSummary.rejectedCount ?? 0;
  const evidenceSummary = resultSummary.evidenceSummary || {};

  return (
    <div className={`rounded-2xl border p-5 ${hasResults ? 'border-accent/40 bg-accent/10' : 'border-black/10 bg-black/[0.03]'}`}>
      <div className="flex items-start gap-3">
        <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-black" />
        <div>
          <h3 className="text-xl font-bold tracking-tight">
            {hasResults
              ? `${resultSummary.count} matching lead${resultSummary.count === 1 ? '' : 's'} found`
              : 'No leads found across the available discovery layers'}
          </h3>
          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-secondary">
            {resultSummary.message
              || `Findly matched business records using ${resultSummary.discoverySourcesRequested?.map((platform) => PLATFORM_LABELS[platform] || platform).join(', ') || 'your selected sources'}`}
            {hasResults && resultSummary.presenceTargetsRequested?.length
              ? ` while prioritizing ${resultSummary.presenceTargetsRequested.map((platform) => PLATFORM_LABELS[platform] || platform).join(', ')}`
              : ''}
            {hasResults ? ' and saved the result set in Lead Lists.' : ''}
          </p>
        </div>
      </div>

      {hasResults && resultSummary.layerSummary?.some((layer) => layer.status === 'COMPLETED') && (
        <div className="mt-4 pl-9">
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Requested: {requestedLimit}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Found: {foundCount}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Accepted: {acceptedCount}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Shortfall: {shortfallCount}</div>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Rejected: {rejectedCount}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Queries: {resultSummary.queryCount ?? resultSummary.queryVariants?.length ?? 0}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Contacts found: {(evidenceSummary.phoneFound || 0) + (evidenceSummary.emailFound || 0)}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Official links: {evidenceSummary.officialLinksFound || 0}</div>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Phone found: {evidenceSummary.phoneFound || 0}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Email found: {evidenceSummary.emailFound || 0}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Map-ready: {evidenceSummary.mapReadyCount || 0}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">AI Assisted: {evidenceSummary.aiAssistedCount || 0}</div>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Rule Based Review: {evidenceSummary.ruleBasedReviewCount || acceptedCount}</div>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black/70">Contact extraction: {evidenceSummary.contactExtractionCount || 0}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {resultSummary.layerSummary
              .filter((layer) => layer.status === 'COMPLETED')
              .map((layer) => (
                <span key={layer.layerKey} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-bold text-black/70">
                  {layerLabel(layer.layerKey)}
                </span>
              ))}
          </div>
          {resultSummary.providerBreakdown?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {resultSummary.providerBreakdown
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span key={`${item.provider}-${item.count}`} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-bold text-black/60">
                    {item.provider.replaceAll('_', ' ')}: {item.count}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {!hasResults && resultSummary.layerSummary?.length > 0 && (
        <div className="mt-4 pl-9">
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-secondary">Layer breakdown</p>
            <div className="mt-3 space-y-2">
              {resultSummary.layerSummary.map((layer) => (
                <div key={layer.layerKey} className="flex flex-col gap-1 rounded-xl border border-black/[0.06] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-black">{layerLabel(layer.layerKey)}</span>
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-secondary">{layer.status}</span>
                  </div>
                  <p className="text-xs font-medium text-black/60">
                    {layer.reason || `${layer.leadsAccepted || layer.leadsFound || 0} usable leads`}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs font-medium leading-5 text-black/55">
              Try a broader governorate, a broader business type, fewer restrictive filters, or configure more discovery providers.
            </p>
          </div>
        </div>
      )}

      {resultSummary.providerWarnings?.length > 0 && (
        <div className="mt-4 pl-9 space-y-2">
          {resultSummary.providerWarnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-900">
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 pl-9">
        {hasResults && (
          <button
            type="button"
            onClick={() => onNavigate?.(`/dashboard/lead-lists${resultSummary.leadListId ? `?listId=${resultSummary.leadListId}` : ''}`)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
          >
            View Lead List
            <ArrowRight size={16} />
          </button>
        )}
        {hasResults && resultSummary.leadListId && (
          <button
            type="button"
            onClick={() => onNavigate?.(`/dashboard/map?listId=${resultSummary.leadListId}`)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-[#F6FFD2]"
          >
            View on Map
          </button>
        )}
        <button
          type="button"
          onClick={onStartNew}
          className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-black/[0.04]"
        >
          {hasResults ? 'Start new search' : 'Adjust search'}
        </button>
      </div>
    </div>
  );
};

export default SearchResultSummary;
