import { Database, Goal, MapPin, Sparkles } from 'lucide-react';
import DashboardCard from '../../DashboardCard';

const SearchSidePanel = ({ selectedPlatformCount, selectedPlatformNames, totalLeads }) => (
  <div className="space-y-5">
    <DashboardCard className="p-5 md:p-6">
      <h3 className="text-xl font-semibold tracking-tight text-black">Search Preview</h3>
      <p className="mt-2 text-[13px] font-semibold leading-relaxed text-black/50">
        A focused search setup that turns your service, location, and source choices into a saved lead list.
      </p>
      <div className="mt-6 grid gap-3">
        {[
          [Sparkles, 'Service fit', 'Matches leads to the service being sold.', 'bg-accent/20 text-black'],
          [MapPin, 'Location intent', 'Country and governorate shape the search scope.', 'bg-black/5 text-black'],
          [Database, 'Source mix', `${selectedPlatformCount} selected source${selectedPlatformCount === 1 ? '' : 's'}${selectedPlatformNames ? `: ${selectedPlatformNames}` : ''}.`, 'bg-black/5 text-black'],
          [Goal, 'Opportunity goal', 'Prioritizes the signals behind the selected search goal.', 'bg-black/5 text-black'],
        ].map(([Icon, title, description, colorClass]) => (
          <div key={title} className="flex gap-3 rounded-xl border border-black/5 bg-black/[0.02] p-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${colorClass}`}>
              <Icon size={18} strokeWidth={2} />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-black">{title}</p>
              <p className="mt-1 text-[12px] font-medium leading-snug text-black/50">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>

    <DashboardCard className="!bg-[#000000] p-5 text-white md:p-6">
      <h3 className="text-xl font-semibold tracking-tight text-white">Credits</h3>
      <p className="mt-2 text-[13px] font-semibold leading-relaxed text-white/50">
        Search uses available stored intelligence during testing. Analysis keeps the normal credit rules.
      </p>
      <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[13px] font-medium text-white/80">
        Available lead intelligence: {totalLeads}
      </p>
    </DashboardCard>
  </div>
);

export default SearchSidePanel;
