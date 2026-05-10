import { Globe2, Goal, MapPin, Sparkles } from 'lucide-react';
import DashboardCard from '../../DashboardCard';

const SearchSidePanel = ({ selectedPlatformCount, selectedPlatformNames, totalLeads }) => (
  <div className="space-y-5">
    <DashboardCard className="p-5 md:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Campaign preview</p>
      <h3 className="mt-3 text-3xl font-bold tracking-tighter">Live Opportunity Search.</h3>
      <p className="mt-3 text-sm font-semibold leading-7 text-secondary">
        Findly uses selected platform signals and available business intelligence to find matching opportunities. Connected official sources can be added later without changing your workflow.
      </p>
      <div className="mt-6 grid gap-3">
        {[
          [Sparkles, 'Service fit', 'Searches will be guided by what the user sells.'],
          [MapPin, 'Location intent', 'Country and governorate shape the search scope.'],
          [Globe2, 'Platform mix', `Using ${selectedPlatformCount} selected platform${selectedPlatformCount === 1 ? '' : 's'}${selectedPlatformNames ? `: ${selectedPlatformNames}` : ''}.`],
          [Goal, 'Search goal', 'Finding real opportunities with actionable signals.'],
        ].map(([Icon, title, description]) => (
          <div key={title} className="flex gap-3 rounded-2xl bg-[#F7F8F6] p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-black">
              <Icon size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-secondary">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>

    <DashboardCard className="!bg-black p-5 text-white md:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Credits</p>
      <h3 className="mt-3 text-2xl font-bold tracking-tighter">Usage cost</h3>
      <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
        Searches using available platform intelligence are free during testing. Analysis still uses normal Opportunity Credit rules.
      </p>
      <p className="mt-4 rounded-2xl bg-white/8 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
        Available lead intelligence: {totalLeads}
      </p>
    </DashboardCard>
  </div>
);

export default SearchSidePanel;
