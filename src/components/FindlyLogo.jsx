/**
 * Findly brand logo — inline SVG reproduction of the official wordmark.
 * 
 * The logo features a custom sans-serif wordmark with two lime-green (#A6FF00) 
 * accent marks: an arrow in the "f" and a parallelogram slash on the "y" descender.
 * 
 * Variant "dark" renders black text + lime accents (for white backgrounds).
 * Variant "light" renders white text + lime accents (for dark backgrounds).
 */
const FindlyLogo = ({ className = '', height = 28, variant = 'dark' }) => {
  const textColor = variant === 'dark' ? '#000000' : '#FFFFFF';
  const accentColor = '#A6FF00';

  return (
    <svg
      viewBox="0 0 320 90"
      height={height}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Findly logo"
    >
      {/* f — vertical stem */}
      <path d="M0 20 Q0 0 20 0 L30 0 L30 10 L20 10 Q10 10 10 20 L10 80 L0 80 Z" fill={textColor} />
      {/* f — crossbar */}
      <rect x="0" y="32" width="28" height="9" rx="1" fill={textColor} />
      {/* f — lime green arrow accent (the brand signature) */}
      <polygon points="18,25 28,32 18,39" fill={accentColor} />

      {/* i — stem */}
      <rect x="38" y="28" width="10" height="52" rx="1" fill={textColor} />
      {/* i — dot */}
      <circle cx="43" cy="16" r="6" fill={textColor} />

      {/* n */}
      <path d="M58 80 L58 28 L68 28 L68 36 Q74 28 86 28 Q98 28 98 44 L98 80 L88 80 L88 46 Q88 36 78 36 Q68 36 68 46 L68 80 Z" fill={textColor} />

      {/* d */}
      <path d="M140 80 L140 0 L130 0 L130 36 Q124 28 112 28 Q100 28 100 54 Q100 80 112 80 Q124 80 130 72 L130 80 Z M130 54 Q130 70 118 70 Q108 70 108 54 Q108 38 118 38 Q130 38 130 54 Z" fill={textColor} />

      {/* l */}
      <rect x="150" y="0" width="10" height="80" rx="1" fill={textColor} />

      {/* y — left arm */}
      <polygon points="170,28 182,60 194,28 205,28 188,72 180,90 170,90 176,76 162,28" fill={textColor} />
      {/* y — lime green slash accent (the brand signature on the y tail) */}
      <polygon points="196,22 206,22 192,42 182,42" fill={accentColor} />
    </svg>
  );
};

export default FindlyLogo;
