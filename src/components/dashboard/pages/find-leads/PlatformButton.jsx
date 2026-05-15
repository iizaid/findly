import { Globe2, Search } from 'lucide-react';
import { FaFacebookF, FaLinkedinIn } from 'react-icons/fa';
import {
  SiGooglemaps,
  SiInstagram,
  SiTiktok,
  SiTripadvisor,
  SiX,
  SiYelp,
  SiYoutube,
} from 'react-icons/si';
import { DATASET_BACKED_SOURCES } from './searchConfig';

const iconMap = {
  GOOGLE_MAPS: SiGooglemaps,
  INSTAGRAM: SiInstagram,
  FACEBOOK: FaFacebookF,
  WEBSITE: Globe2,
  LINKEDIN: FaLinkedinIn,
  YOUTUBE: SiYoutube,
  YELP: SiYelp,
  SERPAPI: Search,
  TRIPADVISOR: SiTripadvisor,
  TIKTOK: SiTiktok,
  X: SiX,
};

const iconColorClass = {
  GOOGLE_MAPS: 'text-[#4285F4]',
  INSTAGRAM: 'text-[#E4405F]',
  FACEBOOK: 'text-[#1877F2]',
  WEBSITE: 'text-black',
  LINKEDIN: 'text-[#0A66C2]',
  YOUTUBE: 'text-[#FF0000]',
  YELP: 'text-[#D32323]',
  SERPAPI: 'text-black',
  TRIPADVISOR: 'text-[#00AF87]',
  TIKTOK: 'text-black',
  X: 'text-black',
};

const PlatformButton = ({ source, selected, onClick }) => {
  const disabled = !source.canRun;
  const Icon = iconMap[source.key] || Search;
  const usesStoredIntelligence = source.fallbackAvailable && DATASET_BACKED_SOURCES.has(source.key) && !source.available;
  const statusLabel = source.available ? 'Connected' : usesStoredIntelligence ? 'Ready' : 'Later';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={`group flex min-h-[58px] items-center justify-between gap-3 rounded-[18px] border px-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected
          ? 'border-black bg-black text-white shadow-[0_16px_34px_rgba(0,0,0,0.22)]'
          : 'border-black/[0.08] bg-white text-black shadow-[0_8px_22px_rgba(0,0,0,0.035)] hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_14px_32px_rgba(0,0,0,0.08)]'
      } ${disabled ? 'cursor-not-allowed opacity-45 hover:translate-y-0 hover:shadow-[0_8px_22px_rgba(0,0,0,0.035)]' : 'cursor-pointer'}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          selected ? 'bg-accent text-black' : 'bg-black/[0.045]'
        }`}>
          <Icon className={selected ? 'text-black' : iconColorClass[source.key] || 'text-black'} size={18} />
        </span>
        <span className="truncate text-[14px] font-black tracking-[-0.01em]">{source.name}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-black ${
        selected
          ? 'bg-white/12 text-white'
          : usesStoredIntelligence
            ? 'bg-accent text-black'
            : 'bg-black/[0.055] text-black/50'
      }`}>
        {statusLabel}
      </span>
    </button>
  );
};

export default PlatformButton;
