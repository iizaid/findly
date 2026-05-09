const DashboardCard = ({ children, className = '' }) => {
  const hasCustomBackground = /(?:^|\s)!?bg-|(?:^|\s)!?from-|(?:^|\s)!?via-|(?:^|\s)!?to-/.test(className);

  return (
    <section
      className={`rounded-[24px] border border-black/[0.08] ${hasCustomBackground ? '' : 'bg-white'} shadow-[0_14px_42px_rgba(0,0,0,0.045)] ${className}`}
    >
      {children}
    </section>
  );
};

export default DashboardCard;
