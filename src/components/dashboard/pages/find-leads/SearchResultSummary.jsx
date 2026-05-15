import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PLATFORM_LABELS } from './searchConfig';

const SearchResultSummary = ({ resultSummary, onNavigate, onStartNew }) => (
  <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5">
    <div className="flex items-start gap-3">
      <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-black" />
      <div>
        <h3 className="text-xl font-bold tracking-tight">
          {resultSummary.count} matching lead{resultSummary.count === 1 ? '' : 's'} found
        </h3>
        <p className="mt-1.5 text-sm font-semibold leading-relaxed text-secondary">
          Findly matched real business records for {resultSummary.platformsRequested?.map((platform) => PLATFORM_LABELS[platform] || platform).join(', ') || 'your selected sources'} and saved the result set in Lead Lists.
        </p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3 pl-9">
      <button
        type="button"
        onClick={() => onNavigate?.(`/dashboard/lead-lists${resultSummary.leadListId ? `?listId=${resultSummary.leadListId}` : ''}`)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
      >
        View Lead List
        <ArrowRight size={16} />
      </button>
      <button
        type="button"
        onClick={onStartNew}
        className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-black/[0.04]"
      >
        Start new search
      </button>
    </div>
  </div>
);

export default SearchResultSummary;
