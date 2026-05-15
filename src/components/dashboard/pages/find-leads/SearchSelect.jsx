import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const normalize = (value) => String(value || '').trim().toLowerCase();

const SearchSelect = ({ label, value, onChange, options = [], placeholder, wide, required }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const cleanOptions = useMemo(() => {
    const seen = new Set();
    return options
      .map((option) => String(option || '').trim())
      .filter(Boolean)
      .filter((option) => {
        const key = normalize(option);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [options]);

  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return cleanOptions;
    return cleanOptions.filter((option) => normalize(option).includes(needle));
  }, [cleanOptions, query]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 40);

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectOption = (option) => {
    onChange(option);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={`relative ${wide ? 'md:col-span-2' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="block text-[13px] font-semibold text-black">{label}</span>
        {required && <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">Required</span>}
      </div>

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left text-[13px] font-bold outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent ${
          open
            ? 'border-accent bg-white shadow-[0_0_0_3px_rgba(166,255,0,0.2)]'
            : 'border-black/[0.08] bg-white hover:border-black/15 hover:bg-black/[0.02]'
        }`}
      >
        <span className={value ? 'truncate text-black' : 'truncate text-secondary/70'}>{value || placeholder || `Select ${label.toLowerCase()}`}</span>
        <ChevronDown size={16} className={`shrink-0 text-black/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
          <div className="border-b border-black/[0.06] p-3">
            <div className="flex h-10 items-center gap-2 rounded-2xl bg-black/[0.035] px-3">
              <Search size={15} className="shrink-0 text-secondary" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-black outline-none placeholder:text-secondary/60"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectOption(option)}
                    className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-left text-[13px] font-bold transition-colors ${
                      selected ? 'bg-accent text-black' : 'text-black hover:bg-black/[0.035]'
                    }`}
                  >
                    <span className="min-w-0 truncate">{option}</span>
                    {selected && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-[13px] font-semibold text-secondary">
                No matching options.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchSelect;
