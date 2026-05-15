const DashboardCard = ({ children, className = '' }) => {
  const hasCustomBackground = /(?:^|\s)!?bg-|(?:^|\s)!?from-|(?:^|\s)!?via-|(?:^|\s)!?to-/.test(className);

  return (
    <section
      className={`rounded-[22px] border border-black/[0.04] ${hasCustomBackground ? '' : 'bg-white'} shadow-sm ${className}`}
    >
      {children}
    </section>
  );
};

export default DashboardCard;
