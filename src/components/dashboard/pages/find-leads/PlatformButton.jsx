import { DATASET_BACKED_SOURCES } from './searchConfig';

const PlatformButton = ({ source, selected, onClick }) => {
  const disabled = !source.canRun;
  const usesSignals = source.fallbackAvailable && DATASET_BACKED_SOURCES.has(source.key) && !source.available;
  const statusLabel = usesSignals ? 'Searchable' : (source.canRun ? 'Ready' : 'Coming later');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-colors ${selected ? 'border-accent bg-accent text-black' : 'border-black/[0.08] bg-[#F7F8F6] text-black hover:bg-white'} ${disabled ? 'cursor-not-allowed opacity-62' : ''}`}
    >
      <span>
        {source.name}
        {usesSignals && (
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-secondary">
            Findly intelligence available
          </span>
        )}
      </span>
      <span className="shrink-0 text-[10px] uppercase text-secondary">{statusLabel}</span>
    </button>
  );
};

export default PlatformButton;
