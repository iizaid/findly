import { CheckCircle2, Loader2 } from 'lucide-react';

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
  SERPAPI: 'SerpAPI',
  X: 'X',
};

const SearchRunningOverlay = ({ isVisible, currentStep = 0, steps = [], selectedPlatforms = [], criteria = {}, pendingSearch = null, onCancel, onCheckStatus, onViewLeadLists }) => {
  if (!isVisible) return null;

  const labels = selectedPlatforms.map((item) => platformLabel[item] || item).filter(Boolean);
  const activeStep = steps[currentStep] || 'Searching available data sources';
  const context = [criteria.businessType, criteria.city].filter(Boolean).join(' in ');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/72 px-4 py-8 backdrop-blur-md" role="status" aria-live="polite">
      <div className="w-full max-w-[520px] rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-[0_28px_90px_rgba(0,0,0,0.16)] md:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black text-accent">
            <Loader2 size={24} className="animate-spin" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">Findly search</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-black">Building your lead list</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-secondary">
              {activeStep}. {context ? `Matching ${context}.` : 'Matching businesses against your setup.'}
            </p>
            <p className="mt-1 text-xs font-medium text-secondary/80">
              Your search is running. Credits are reserved, not permanently charged yet.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {labels.map((label) => (
            <span key={label} className="rounded-full border border-black/[0.08] bg-black/[0.03] px-3 py-1.5 text-xs font-bold text-black">
              {label}
            </span>
          ))}
        </div>

        <div className="mt-6 space-y-2.5">
          {steps.map((step, index) => {
            const completed = currentStep > index;
            const active = currentStep === index;

            return (
              <div key={step} className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${active ? 'bg-accent/25' : 'bg-black/[0.025]'}`}>
                {completed ? (
                  <CheckCircle2 size={17} className="text-black" />
                ) : active ? (
                  <Loader2 size={17} className="animate-spin text-black" />
                ) : (
                  <span className="h-[17px] w-[17px] rounded-full border border-black/15" />
                )}
                <span className={`text-[13px] font-bold ${active || completed ? 'text-black' : 'text-secondary/60'}`}>{step}</span>
              </div>
            );
          })}
        </div>

        {pendingSearch && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.06] pt-5">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
            >
              Cancel search
            </button>
            <button
              type="button"
              onClick={onCheckStatus}
              className="inline-flex h-9 items-center rounded-full bg-black px-4 text-xs font-bold text-white transition-colors hover:bg-black/80"
            >
              Check status
            </button>
            <button
              type="button"
              onClick={onViewLeadLists}
              className="inline-flex h-9 items-center rounded-full border border-black/10 bg-white px-4 text-xs font-bold text-black transition-colors hover:bg-black/5"
            >
              View Lead Lists
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchRunningOverlay;
