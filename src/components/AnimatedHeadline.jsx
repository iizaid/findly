import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const TYPING_SPEED = 35;       // ms per character
const CARET_LINGER_MS = 1800;  // caret blink duration after typing finishes

const AnimatedHeadline = ({ text = "Your Next Client Is Hiding in Plain Sight.", highlightWord = "Hiding", ready = false }) => {
  const [charCount, setCharCount] = useState(0);
  const [showCaret, setShowCaret] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const visibleCount = shouldReduceMotion ? text.length : charCount;
  const done = visibleCount >= text.length;
  
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const startedRef = useRef(false);

  // Stop RAF when done
  useEffect(() => {
    if (done && rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, [done]);

  // Fade the caret out after typing finishes
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setShowCaret(false), CARET_LINGER_MS);
    return () => clearTimeout(t);
  }, [done]);

  // Main typing loop
  useEffect(() => {
    if (shouldReduceMotion || !ready || done) return;

    let localRaf;
    
    const tick = (timestamp) => {
      if (!startedRef.current) {
        lastTimeRef.current = timestamp;
        startedRef.current = true;
      }

      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= TYPING_SPEED) {
        lastTimeRef.current = timestamp - (elapsed % TYPING_SPEED);
        setCharCount(prev => {
          if (prev >= text.length) return prev;
          return prev + 1;
        });
      }

      localRaf = requestAnimationFrame(tick);
      rafRef.current = localRaf;
    };

    // Small initial delay before typing starts
    const startDelay = setTimeout(() => {
      startedRef.current = false; // Reset timing on start
      localRaf = requestAnimationFrame(tick);
      rafRef.current = localRaf;
    }, 400);

    // Fallback in case RAF gets throttled (e.g. background tab)
    const fallback = setTimeout(() => {
      setCharCount(text.length);
    }, Math.max(2600, text.length * TYPING_SPEED + 900));

    return () => {
      clearTimeout(startDelay);
      clearTimeout(fallback);
      if (localRaf) cancelAnimationFrame(localRaf);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready, done, text.length, shouldReduceMotion]);

  /*
   * Build rendered fragments.
   */
  const highlightStart = text.indexOf(highlightWord);
  const highlightEnd = highlightStart + highlightWord.length;
  const visible = text.slice(0, visibleCount);

  const renderSegments = () => {
    if (highlightStart === -1) {
      return <span>{visible}</span>;
    }

    const segments = [];

    // before highlight
    if (visibleCount > 0 && highlightStart > 0) {
      segments.push(
        <span key="pre">{visible.slice(0, Math.min(visibleCount, highlightStart))}</span>
      );
    }

    // the highlighted word
    if (visibleCount > highlightStart) {
      const hlText = visible.slice(highlightStart, Math.min(visibleCount, highlightEnd));
      segments.push(
        <span key="hl" className="font-editorial" style={{ color: '#A6FF00' }}>
          {hlText}
        </span>
      );
    }

    // after highlight
    if (visibleCount > highlightEnd) {
      segments.push(
        <span key="post">{visible.slice(highlightEnd)}</span>
      );
    }

    return segments;
  };

  return (
    <h1
      className="findly-hero-title mx-auto mb-8 max-w-[1100px] text-center font-bold leading-[1.02] tracking-tighter text-primary"
      style={{ textWrap: 'balance' }}
    >
      {renderSegments()}

      {/* Caret — only show when ready */}
      {ready && showCaret && !shouldReduceMotion && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`inline-block w-[3px] md:w-[4px] h-[0.85em] ml-[2px] align-middle rounded-full ${done ? 'animate-caret' : ''}`}
          style={{ backgroundColor: '#A6FF00' }}
        />
      )}
    </h1>
  );
};

export default AnimatedHeadline;
