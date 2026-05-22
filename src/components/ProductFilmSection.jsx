import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const VIDEO_SRC = '/videos/findly-product-film.mp4';
const VIDEO_READY = false;

const ProductFilmSection = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedVideoRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  const handleOpen = () => {
    setIsExpanded(true);
    document.body.style.overflow = 'hidden';
  };

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    document.body.style.overflow = '';
    if (expandedVideoRef.current) expandedVideoRef.current.pause();
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isExpanded) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, isExpanded]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <section id="product-film" className="relative overflow-hidden bg-white px-4 pb-14 pt-16 scroll-mt-24 sm:px-6 md:pb-20 md:pt-32">
      <div className="relative z-10 max-w-6xl mx-auto">

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5 flex justify-center md:mb-7"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[11px] font-semibold text-secondary uppercase tracking-[0.2em]">
              Product Film
            </span>
          </div>
        </motion.div>

        {/* Title — large and dominant */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mb-4 max-w-4xl text-center text-3xl font-bold leading-[1.08] tracking-tight text-primary sm:text-4xl md:mb-5 md:text-6xl lg:text-[4rem]"
          style={{ textWrap: 'balance' }}
        >
          See how Findly turns business data into opportunities.
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mb-8 max-w-xl text-center text-sm leading-7 text-secondary/60 sm:text-base md:mb-16 md:text-lg md:leading-relaxed"
        >
          A quick visual walkthrough of how scattered online clues become clear, actionable leads.
        </motion.p>

        {/* Video container */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center"
          >
          <motion.button
            type="button"
            aria-label={VIDEO_READY ? 'Open Findly product film' : 'Open product film coming soon message'}
            layoutId="video-frame"
            whileHover={shouldReduceMotion ? undefined : { scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={handleOpen}
            className="group relative aspect-video w-full max-w-[1180px] cursor-pointer overflow-hidden rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:rounded-2xl"
            style={{
              boxShadow: '0 8px 50px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
            }}
          >
            {/* Dark cinematic surface */}
            <div className="absolute inset-0 bg-[#0A0A0A]" />

            {/* Very subtle inner noise texture */}
            <div
              className="absolute inset-0 opacity-[0.04] pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06) 0%, transparent 60%)',
              }}
            />

            {/* Video or placeholder content */}
            {VIDEO_READY ? (
              <video
                src={VIDEO_SRC}
                muted
                playsInline
                preload="metadata"
                className="relative w-full h-full object-cover"
              />
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <span className="text-[11px] font-medium text-white/20 tracking-widest uppercase">
                  Motion graphics video coming soon
                </span>
              </div>
            )}

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Circle */}
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 backdrop-blur-sm transition-all duration-400 group-hover:border-white/20 group-hover:bg-white/15 md:h-20 md:w-20">
                  <svg
                    viewBox="0 0 24 24"
                    className="ml-1 h-5 w-5 md:h-7 md:w-7"
                    fill="#A6FF00"
                  >
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                </div>

                {/* Hover pulse */}
                <div className="absolute inset-0 rounded-full border border-accent/0 group-hover:border-accent/25 group-hover:scale-[1.3] transition-all duration-600 ease-out" />
              </div>
            </div>

            {/* Thin accent line at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]">
              <div className="h-full w-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
            </div>
          </motion.button>
        </motion.div>
      </div>

      {/* ─── Lightbox ─── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-6 md:p-12"
            onClick={handleClose}
            role="presentation"
          >
            {/* Soft frosted backdrop */}
            <div className="absolute inset-0 bg-white/85 backdrop-blur-2xl" />

            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              onClick={handleClose}
              className="absolute top-6 right-6 md:top-8 md:right-8 z-[9999] w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Close video"
              type="button"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </motion.button>

            {/* Expanded video — grows from the inline position */}
            <motion.div
              layoutId="video-frame"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-film-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[1400px] aspect-video rounded-2xl overflow-hidden"
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                boxShadow: '0 30px 90px rgba(0,0,0,0.12), 0 10px 30px rgba(0,0,0,0.06)',
              }}
            >
              <div className="absolute inset-0 bg-[#0A0A0A]" />

              {VIDEO_READY ? (
                <video
                  ref={expandedVideoRef}
                  src={VIDEO_SRC}
                  controls
                  autoPlay
                  playsInline
                  className="relative w-full h-full object-cover"
                />
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center gap-5">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="#A6FF00">
                      <polygon points="6,3 20,12 6,21" />
                    </svg>
                  </div>
                  <p id="product-film-modal-title" className="max-w-sm text-center text-sm font-semibold text-white/55 tracking-wide md:text-base">
                    The Findly product film is coming soon.
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ProductFilmSection;
