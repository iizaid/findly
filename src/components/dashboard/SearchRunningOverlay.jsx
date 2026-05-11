import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Loader2, Radar, Sparkles } from 'lucide-react';

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

const SearchRunningOverlay = ({ isVisible, currentStep = 0, steps = [], selectedPlatforms = [], criteria = {} }) => {
  const rootRef = useRef(null);
  const cardRef = useRef(null);
  const ringRef = useRef(null);
  const pulseRef = useRef(null);
  const orbitRef = useRef(null);

  const platformText = useMemo(() => {
    const labels = selectedPlatforms.map((item) => platformLabel[item] || item).filter(Boolean);
    if (!labels.length) return 'selected platforms';
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join(' and ');
    return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  }, [selectedPlatforms]);

  useEffect(() => {
    if (!isVisible || !rootRef.current) return undefined;

    let cancelled = false;
    let ctx;

    import('gsap').then(({ gsap }) => {
      if (cancelled || !rootRef.current) return;
      ctx = gsap.context(() => {
        gsap.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power2.out' });
        gsap.fromTo(cardRef.current, { y: 28, scale: 0.965, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.62, ease: 'power3.out' });
        gsap.to(ringRef.current, { rotate: 360, duration: 8, repeat: -1, ease: 'none' });
        gsap.to(orbitRef.current, { rotate: -360, duration: 12, repeat: -1, ease: 'none' });
        gsap.to(pulseRef.current, { scale: 1.16, opacity: 0.24, duration: 1.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.fromTo('.search-step-row', { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, stagger: 0.075, ease: 'power2.out', delay: 0.2 });
        gsap.fromTo('.search-chip', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.055, ease: 'power2.out', delay: 0.28 });
      }, rootRef);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8" role="status" aria-live="polite">
      <div className="absolute inset-0 bg-white/58 backdrop-blur-[18px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,255,0,0.24),transparent_38%),radial-gradient(circle_at_20%_80%,rgba(0,0,0,0.08),transparent_32%)]" />

      <div ref={cardRef} className="relative w-full max-w-[760px] overflow-hidden rounded-[38px] border border-white/65 bg-white/86 p-6 shadow-[0_34px_120px_rgba(0,0,0,0.18)] md:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/35 blur-3xl" />
        <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

        <div className="relative grid gap-7 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <div className="relative mx-auto flex h-[210px] w-[210px] items-center justify-center">
            <div ref={pulseRef} className="absolute h-40 w-40 rounded-full bg-accent" />
            <div ref={ringRef} className="absolute h-[190px] w-[190px] rounded-full border border-black/10 border-t-black border-r-accent" />
            <div ref={orbitRef} className="absolute h-[150px] w-[150px] rounded-full border border-dashed border-black/20">
              <span className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-black shadow-[0_0_0_8px_rgba(0,0,0,0.06)]" />
              <span className="absolute bottom-4 right-3 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_7px_rgba(168,255,0,0.22)]" />
            </div>
            <div className="relative flex h-[106px] w-[106px] items-center justify-center rounded-[30px] bg-black text-accent shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <Radar size={42} />
            </div>
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white">
              <Loader2 size={14} className="animate-spin text-accent" />
              Search in progress
            </div>
            <h3 className="mt-5 max-w-xl text-4xl font-bold leading-[0.95] tracking-tighter text-black md:text-5xl">
              Findly is building your lead list.
            </h3>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-7 text-secondary">
              Scanning {platformText}, matching businesses, ranking opportunity fit, and saving the result set so it stays available in Lead Lists.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {selectedPlatforms.map((platform) => (
                <span key={platform} className="search-chip rounded-full border border-black/[0.08] bg-[#F7F8F6] px-3 py-1.5 text-xs font-bold text-black">
                  {platformLabel[platform] || platform}
                </span>
              ))}
              {criteria.businessType && (
                <span className="search-chip rounded-full border border-black/[0.08] bg-[#F7F8F6] px-3 py-1.5 text-xs font-bold text-black">
                  {criteria.businessType}
                </span>
              )}
              {criteria.city && (
                <span className="search-chip rounded-full border border-black/[0.08] bg-[#F7F8F6] px-3 py-1.5 text-xs font-bold text-black">
                  {criteria.city}
                </span>
              )}
            </div>

            <div className="mt-7 space-y-3">
              {steps.map((step, index) => {
                const completed = currentStep > index;
                const active = currentStep === index;
                return (
                  <div key={step} className={`search-step-row flex items-center gap-3 rounded-2xl border px-4 py-3 ${active ? 'border-accent bg-accent/20' : completed ? 'border-black/[0.08] bg-white' : 'border-black/[0.06] bg-[#F7F8F6]/70'}`}>
                    {completed ? (
                      <CheckCircle2 size={18} className="text-black" />
                    ) : active ? (
                      <Sparkles size={18} className="text-black" />
                    ) : (
                      <span className="h-[18px] w-[18px] rounded-full border border-black/15" />
                    )}
                    <span className={`text-sm font-bold ${active || completed ? 'text-black' : 'text-secondary/60'}`}>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchRunningOverlay;
