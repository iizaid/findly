import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const LOADING_DURATION = 2800; // total time before exit

const LoadingScreen = ({ onComplete }) => {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'exiting' | 'done'
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('exiting');
      // After exit animation finishes, signal parent
      setTimeout(() => {
        setPhase('done');
        onComplete?.();
      }, shouldReduceMotion ? 120 : 700);
    }, shouldReduceMotion ? 500 : LOADING_DURATION);

    return () => clearTimeout(timer);
  }, [onComplete, shouldReduceMotion]);

  if (phase === 'done') return null;

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          animate={phase === 'exiting' ? { opacity: 0, y: -30 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
        >
          {/* Center content */}
          <div className="relative flex flex-col items-center gap-10">

            {/* Logo reveal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <img
                src="/findly-logo-dark.png"
                alt="Findly"
                className="h-16 md:h-20 w-auto"
                draggable={false}
              />
            </motion.div>

            {/* Scanning line container */}
            <div className="relative w-48 md:w-56">
              {/* Track */}
              <div className="h-[1.5px] w-full bg-black/[0.06] rounded-full overflow-hidden">
                {/* Animated scan bar */}
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{
                    duration: 1.4,
                    repeat: shouldReduceMotion ? 0 : Infinity,
                    ease: [0.4, 0, 0.6, 1],
                  }}
                  className="h-full w-1/2 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #A6FF00, transparent)',
                  }}
                />
              </div>
            </div>

            {/* Loading text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-xs md:text-sm font-medium tracking-widest uppercase text-secondary/50"
            >
              Finding opportunities
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.6, repeat: shouldReduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
              >
                ...
              </motion.span>
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingScreen;
