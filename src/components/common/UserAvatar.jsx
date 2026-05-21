import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { getAssetUrl } from '../../lib/assets';

const SIZE_CLASSES = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-20 w-20',
};

const VARIANT_CLASSES = {
  light: {
    shell: 'bg-black/[0.04] border border-black/[0.06]',
    icon: 'text-black/70',
    overlay: 'bg-black/60 text-white',
  },
  dark: {
    shell: 'bg-white/10 border border-white/10',
    icon: 'text-white/70',
    overlay: 'bg-black/55 text-white',
  },
};

const joinClasses = (...values) => values.filter(Boolean).join(' ');

const resolveRoundedClass = (rounded) => {
  if (!rounded || rounded === 'full') return 'rounded-full';
  return rounded;
};

const DefaultAvatarGraphic = ({ variant = 'light' }) => {
  const colors = VARIANT_CLASSES[variant] || VARIANT_CLASSES.light;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={joinClasses('h-full w-full', colors.icon)}
      fill="none"
    >
      <circle cx="32" cy="22" r="12" fill="currentColor" />
      <path
        d="M14 52c0-10.493 8.507-19 19-19h-2c10.493 0 19 8.507 19 19a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4Z"
        fill="currentColor"
      />
    </svg>
  );
};

const UserAvatar = ({
  user,
  size = 'md',
  className = '',
  imgClassName = '',
  rounded = 'full',
  variant = 'light',
  showLogoutOverlay = false,
}) => {
  const resolvedSrc = getAssetUrl(user?.avatarUrl);
  const [imgSrc, setImgSrc] = useState(resolvedSrc);

  useEffect(() => {
    setImgSrc(resolvedSrc);
  }, [resolvedSrc]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const roundedClass = resolveRoundedClass(rounded);
  const colors = VARIANT_CLASSES[variant] || VARIANT_CLASSES.light;
  const shouldShowImage = Boolean(imgSrc);

  return (
    <div
      className={joinClasses(
        'relative shrink-0 overflow-hidden',
        sizeClass,
        roundedClass,
        colors.shell,
        className,
      )}
    >
      {shouldShowImage ? (
        <img
          src={imgSrc}
          alt=""
          className={joinClasses('h-full w-full object-cover', roundedClass, imgClassName)}
          onError={() => setImgSrc(null)}
        />
      ) : (
        <div className={joinClasses('flex h-full w-full items-center justify-center', roundedClass)}>
          <DefaultAvatarGraphic variant={variant} />
        </div>
      )}

      {showLogoutOverlay ? (
        <div
          className={joinClasses(
            'pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100',
            roundedClass,
            colors.overlay,
          )}
        >
          <LogOut size={14} />
        </div>
      ) : null}
    </div>
  );
};

export default UserAvatar;
