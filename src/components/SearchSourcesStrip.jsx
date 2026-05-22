import React from 'react';

/**
 * Monochrome SVG icons for each search source.
 * All icons use currentColor for theme-consistent rendering.
 */
const icons = {
  Instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" />
    </svg>
  ),
  'Google Maps': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  LinkedIn: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13.2a8.16 8.16 0 004.77 1.53V11.3a4.85 4.85 0 01-.81.07 4.86 4.86 0 01-2.38-.62V8.45a8.3 8.3 0 004 1.63V6.69z" />
    </svg>
  ),
  Websites: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  Yelp: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M12.14 2C10.75 2 9.44 5.52 8.88 7.57c-.18.66.28 1.34.97 1.34h2.82c.6 0 1.05-.56.9-1.14C13.07 5.37 13.53 2 12.14 2zM7.26 10.5c-.55-.35-1.32-.07-1.45.57l-.74 3.63c-.12.59.34 1.13.95 1.13h.06c.69 0 1.55-.46 1.55-1.07V11.3c0-.34-.16-.65-.37-.8zM9.5 16.23c-.46.41-.36 1.12.18 1.38l3 1.43c.5.24 1.1-.1 1.17-.66.07-.57-.04-1.7-.66-2.19l-2.5-1.95c-.3-.23-.73-.26-1.06-.05l-.13.04zM16.03 10.82c-.12-.59-.82-.85-1.34-.5l-2.38 1.6c-.32.22-.47.6-.37.98l.5 1.88c.14.52.72.78 1.2.54l2.1-1.06c.52-.26.55-.93.3-1.38l-.01-.06zM16.74 15.25c.6 0 1.08-.52.95-1.11l-.72-3.37c-.14-.63-.88-.92-1.43-.56l-.06.04c-.4.28-.5.87-.17 1.22l2.08 2.77c.22.3.06 1.01.35 1.01z" />
    </svg>
  ),
  TripAdvisor: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="8" cy="14" r="3" />
      <circle cx="16" cy="14" r="3" />
      <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
      <path d="M5 14C5 9.58 8.13 6 12 6s7 3.58 7 8" />
      <path d="M2 11l3 3M22 11l-3 3" />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43z" />
      <polygon points="9.75,15.02 15.5,11.75 9.75,8.48" fill="white" />
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
};

const sources = [
  'Instagram', 'Facebook', 'Google Maps', 'LinkedIn', 'TikTok',
  'Website', 'Yelp', 'TripAdvisor', 'YouTube', 'X',
];

const iconFor = (name) => icons[name.replace('Website', 'Websites')] || icons[name];

const SourceItem = ({ name }) => (
  <div className="flex items-center gap-2.5 px-5 md:px-7 text-secondary/60 hover:text-primary transition-colors duration-300 cursor-default shrink-0 select-none group">
    <span className="group-hover:text-accent transition-colors duration-300">
      {iconFor(name)}
    </span>
    <span className="text-sm font-medium tracking-wide whitespace-nowrap">
      {name}
    </span>
  </div>
);

const Separator = () => (
  <div className="shrink-0 w-px h-4 bg-black/[0.06] mx-1" />
);

const SearchSourcesStrip = () => {
  return (
    <section id="sources" className="relative border-y border-black/[0.04] bg-white py-7 md:py-9 overflow-hidden scroll-mt-24">
      
      {/* Section label */}
      <div className="flex justify-center mb-5">
        <span className="text-[10px] font-semibold text-secondary/40 uppercase tracking-[0.25em]">
          Sources
        </span>
      </div>

      {/* Marquee container with edge fade masks */}
      <div
        className="relative"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        }}
      >
        {/* Animated track — pause on hover */}
        <div className="marquee-track flex items-center">
          
          {/* 4 identical copies — ensures full coverage on any screen width */}
          {[0, 1, 2, 3].map((copy) => (
            <div key={copy} className="marquee-content flex items-center shrink-0" aria-hidden={copy > 0}>
              {sources.map((name, i) => (
                <React.Fragment key={`${copy}-${i}`}>
                  <SourceItem name={name} />
                  <Separator />
                </React.Fragment>
              ))}
            </div>
          ))}

        </div>
      </div>
    </section>
  );
};

export default SearchSourcesStrip;
