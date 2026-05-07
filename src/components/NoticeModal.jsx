import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const NoticeModal = ({ notice, onClose }) => {
  useEffect(() => {
    if (!notice) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [notice, onClose]);

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-5 py-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
          role="presentation"
        >
          <div className="absolute inset-0 bg-white/82 backdrop-blur-xl" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-title"
            aria-describedby="notice-description"
            className="relative w-full max-w-[520px] rounded-[30px] border border-black/[0.08] bg-white p-6 text-black shadow-[0_30px_90px_rgba(0,0,0,0.14)] md:p-8"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close message"
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.04] text-black transition-colors duration-200 hover:bg-black/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X size={18} />
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-black">
              <span className="text-lg font-bold">f</span>
            </div>
            <h2 id="notice-title" className="mt-6 max-w-sm text-3xl font-bold leading-tight tracking-tighter md:text-4xl">
              {notice.title}
            </h2>
            <p id="notice-description" className="mt-4 text-sm font-semibold leading-7 text-secondary md:text-base md:leading-8">
              {notice.message}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-full bg-black px-6 text-sm font-bold text-white transition-colors duration-300 hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NoticeModal;
