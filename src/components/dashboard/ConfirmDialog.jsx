import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
  requireTypedConfirmation = false,
  confirmationText = '',
}) => {
  const [typedText, setTypedText] = useState('');

  const canConfirm = requireTypedConfirmation
    ? typedText === confirmationText
    : true;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}>
              <AlertTriangle size={22} />
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/5 hover:text-black"
            >
              <X size={16} />
            </button>
          </div>

          <h3 className="mt-4 text-xl font-bold tracking-tight text-black">{title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-secondary">{description}</p>

          {requireTypedConfirmation && (
            <div className="mt-4">
              <p className="text-xs font-bold text-black/60 mb-2">
                Type <span className="font-black text-red-600">{confirmationText}</span> to confirm:
              </p>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                className="h-11 w-full rounded-2xl border border-red-200 bg-red-50/50 px-4 text-sm font-bold text-black outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                placeholder={confirmationText}
                autoFocus
              />
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="h-11 flex-1 rounded-full border border-black/[0.08] bg-white text-sm font-bold text-black transition-colors hover:bg-black/5 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading || !canConfirm}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConfirmDialog;
