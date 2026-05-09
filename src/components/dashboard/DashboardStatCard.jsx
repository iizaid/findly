import DashboardCard from './DashboardCard';

const DashboardStatCard = ({ icon: Icon, label, value, note, tone = 'light' }) => {
  const dark = tone === 'dark';

  return (
    <DashboardCard className={`p-5 md:p-6 ${dark ? 'border-black !bg-black text-white' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? 'bg-accent text-black' : 'bg-[#F7F8F6] text-black'}`}>
          {Icon && <Icon size={20} />}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${dark ? 'bg-white/10 text-white/70' : 'bg-accent/35 text-black'}`}>
          {note}
        </span>
      </div>
      <p className={`mt-6 text-xs font-bold uppercase tracking-[0.2em] ${dark ? 'text-white/50' : 'text-secondary'}`}>{label}</p>
      <p className="mt-3 text-4xl font-bold tracking-tighter md:text-5xl">{value}</p>
    </DashboardCard>
  );
};

export default DashboardStatCard;
