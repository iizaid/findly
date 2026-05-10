import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Globe2, Goal, MapPin, Search, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { apiRequest, ApiError } from '../../../lib/api';

const preferredSourceOrder = [
  'INSTAGRAM',
  'GOOGLE_MAPS',
  'FACEBOOK',
  'WEBSITE',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'TRIPADVISOR',
  'YELP',
  'X'
];
const datasetBackedSources = new Set(['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP', 'SERPAPI', 'TRIPADVISOR', 'YOUTUBE', 'X', 'LINKEDIN', 'TIKTOK']);

const defaultGoals = ['General opportunity discovery'];

const friendlyErrorMessage = (error) => {
  if (error instanceof ApiError) {
    if (['SOURCE_NOT_CONFIGURED', 'SOURCE_UNAVAILABLE', 'PROVIDER_NOT_CONFIGURED'].includes(error.code)) {
      return 'This platform is not connected yet. Select another platform or try again later.';
    }
    if (error.code === 'VALIDATION_ERROR') {
      return 'Check the search setup fields and try again.';
    }
    return error.message || 'Search could not be completed.';
  }

  return 'Search could not be completed.';
};

const platformLabel = {
  INSTAGRAM: 'Instagram',
  GOOGLE_MAPS: 'Google Maps',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Website',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TRIPADVISOR: 'TripAdvisor',
  YELP: 'Yelp',
  X: 'X',
};

const SEARCH_STEPS = [
  'Preparing campaign',
  'Reading selected platform signals',
  'Matching businesses by location and category',
  'Ranking opportunity fit',
  'Building your lead list',
];

const DashboardFindLeadsPage = ({ onNotice, workspace, onNavigate }) => {
  const [selectedSources, setSelectedSources] = useState(['INSTAGRAM']);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [searchOptions, setSearchOptions] = useState({
    services: [],
    businessTypes: [],
    countries: [],
    governorates: [],
    cities: [],
    searchGoals: defaultGoals,
    maxResultsOptions: [10, 20, 50],
    datasetStats: {},
  });
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [searchStep, setSearchStep] = useState(null);
  const [resultSummary, setResultSummary] = useState(null);

  useEffect(() => {
    let mounted = true;

    apiRequest('/api/search/options')
      .then((response) => {
        if (!mounted) return;
        const nextOptions = response.data || {};
        setSearchOptions({
          services: nextOptions.services || [],
          businessTypes: nextOptions.businessTypes || [],
          countries: nextOptions.countries || [],
          governorates: nextOptions.governorates || nextOptions.cities || [],
          cities: nextOptions.cities || [],
          searchGoals: nextOptions.searchGoals || defaultGoals,
          maxResultsOptions: nextOptions.maxResultsOptions || [10, 20, 50],
          datasetStats: nextOptions.datasetStats || {},
        });

        const sources = nextOptions.sources || [];
        const ordered = [...sources]
          .filter((source) => preferredSourceOrder.includes(source.key))
          .sort((a, b) => preferredSourceOrder.indexOf(a.key) - preferredSourceOrder.indexOf(b.key))
          .map((source) => ({
            ...source,
            id: source.key,
            name: source.label,
            canRun: (source.key === 'GOOGLE_MAPS' && (source.available || source.fallbackAvailable))
              || (datasetBackedSources.has(source.key) && source.fallbackAvailable),
          }));
        setSourceOptions(ordered);

        if (ordered.length > 0) {
          const preferred = ordered.find((source) => source.key === 'INSTAGRAM' && source.canRun)
            || ordered.find((source) => source.key === 'GOOGLE_MAPS' && source.canRun)
            || ordered.find((source) => source.canRun);
          if (preferred) {
            setSelectedSources((current) => (
              ordered.some((source) => source.id === current[0] && source.canRun)
                ? current
                : [preferred.id]
            ));
          }
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSourceOptions([
          {
            id: 'GOOGLE_MAPS',
            key: 'GOOGLE_MAPS',
            name: 'Google Maps / Places',
            label: 'Google Maps / Places',
            available: false,
            canRun: false,
            reason: 'Source status could not be loaded.',
          },
        ]);
      })
      .finally(() => {
        if (mounted) setSourcesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const MAX_SELECTED_PLATFORMS = 5;

  const toggleSource = (sourceObj) => {
    if (!sourceObj.canRun) {
      setError(
        sourceObj.key === 'REDDIT'
          ? 'Reddit will search public demand signals after compliant API access is connected.'
          : 'This platform is not connected yet. Select an available platform signal to continue.'
      );
      return;
    }
    
    setError(null);
    setSelectedSources((current) => {
      if (current.includes(sourceObj.id)) {
        return current.length === 1 ? current : current.filter((id) => id !== sourceObj.id);
      }
      if (current.length >= MAX_SELECTED_PLATFORMS) {
        setError(`You can select up to ${MAX_SELECTED_PLATFORMS} platforms per search.`);
        return current;
      }
      return [...current, sourceObj.id];
    });
  };

  const [formState, setFormState] = useState(() => {
    try {
      const saved = sessionStorage.getItem('findly_find_leads_state');
      return saved ? JSON.parse(saved) : { service: '', businessType: '', goal: defaultGoals[0], country: '', city: '', maxResults: 20 };
    } catch {
      return { service: '', businessType: '', goal: defaultGoals[0], country: '', city: '', maxResults: 20 };
    }
  });

  const updateField = (field, value) => {
    const next = { ...formState, [field]: value };
    setFormState(next);
    sessionStorage.setItem('findly_find_leads_state', JSON.stringify(next));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResultSummary(null);
    setIsSubmitting(true);
    setSearchStep(0);

    const { service, businessType, goal, country, city, maxResults } = formState;
    
    if (selectedSources.length < 1) {
      setError('Please select at least one platform to proceed.');
      setIsSubmitting(false);
      return;
    }

    const unreadySource = selectedSources.find(id => {
      const s = sourceOptions.find(opt => opt.id === id);
      return !s?.canRun;
    });

    if (unreadySource) {
      const selectedSource = sourceOptions.find((source) => source.id === unreadySource);
      setError(selectedSource?.reason || 'One of the selected platforms is not ready to run yet.');
      setIsSubmitting(false);
      return;
    }

    try {
      setSearchStage('Scanning available sources...');
      // 1. Create a service profile
      const profileRes = await apiRequest('/api/search/profiles', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: workspace?.id,
          name: `${service} Profile`,
          serviceType: service,
          targetBusinessTypes: [businessType],
          targetLocations: [city, country],
          idealSignals: [goal],
        })
      });
      
      const profileId = profileRes.data.profile.id;

      setSearchStep(1);
      // 2. Create the campaign
      const campaignName = `${businessType} in ${city}`;
      const campaignRes = await apiRequest('/api/search/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: workspace?.id,
          name: campaignName,
          serviceProfileId: profileId,
          businessTypes: [businessType],
          country,
          city,
          sources: selectedSources,
          filters: { goal },
          requestedLimit: Number(maxResults) || 20
        })
      });

      const campaignId = campaignRes.data.campaign.id;

      setSearchStep(2);
      // 3. Run the campaign
      const runRes = await apiRequest(`/api/search/campaigns/${campaignId}/run`, {
        method: 'POST',
      });

      const runData = runRes.data || {};
      setSearchStep(3);

      if ((runData.leadsReturned ?? runData.savedLeadsCount ?? 0) === 0) {
        setError('No matching leads found. Try broader filters, a different location, or fewer platform constraints.');
        return;
      }

      setSearchStep(4);
      
      // Clear the session storage since the campaign was created successfully
      sessionStorage.removeItem('findly_find_leads_state');
      setFormState({ service: '', businessType: '', goal: searchOptions.searchGoals[0] || defaultGoals[0], country: '', city: '', maxResults: 20 });

      setResultSummary({
        leadListId: runData.leadListId,
        count: runData.leadsReturned ?? runData.savedLeadsCount ?? 0,
        platformsRequested: runData.platformsRequested || selectedSources,
        sourceMode: runData.sourceMode,
      });
      
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
      setSearchStep(null);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] 2xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
      <DashboardCard className="p-5 md:p-7">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
          <Search size={26} />
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Search campaign</p>
        <h2 className="mt-3 text-4xl font-bold tracking-tighter md:text-5xl">Tell Findly who to search for.</h2>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-secondary">
          Define the service you sell, the business type you want, and the platforms to scan.
        </p>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border border-red-100">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <form className="mt-7 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">Service you offer</span>
            <select
              name="service"
              required
              value={formState.service}
              onChange={(e) => updateField('service', e.target.value)}
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors placeholder:text-secondary/45 focus:border-black/20 focus:bg-white"
            >
              <option value="">Select a service</option>
              {searchOptions.services.map((service) => <option key={service} value={service}>{service}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Target business type</span>
            <select
              name="businessType"
              required
              value={formState.businessType}
              onChange={(e) => updateField('businessType', e.target.value)}
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors placeholder:text-secondary/45 focus:border-black/20 focus:bg-white"
            >
              <option value="">Select a business type</option>
              {searchOptions.businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Search goal</span>
            <select
              name="goal"
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors focus:border-black/20 focus:bg-white"
              value={formState.goal}
              onChange={(e) => updateField('goal', e.target.value)}
            >
              {searchOptions.searchGoals.map((goal) => <option key={goal} value={goal}>{goal}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Country</span>
            <select
              name="country"
              required
              value={formState.country}
              onChange={(e) => updateField('country', e.target.value)}
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors placeholder:text-secondary/45 focus:border-black/20 focus:bg-white"
            >
              <option value="">Select a country</option>
              {searchOptions.countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
          <label>
              <span className="mb-2 block text-sm font-bold">Governorate</span>
            <select
              name="city"
              required
              value={formState.city}
              onChange={(e) => updateField('city', e.target.value)}
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors placeholder:text-secondary/45 focus:border-black/20 focus:bg-white"
            >
              <option value="">Select a governorate</option>
              {(searchOptions.governorates?.length ? searchOptions.governorates : searchOptions.cities).map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-bold">Max results</span>
            <select
              name="maxResults"
              value={formState.maxResults}
              onChange={(e) => updateField('maxResults', Number(e.target.value))}
              className="h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors focus:border-black/20 focus:bg-white md:w-48"
            >
              {searchOptions.maxResultsOptions.map((limit) => <option key={limit} value={limit}>{limit} leads</option>)}
            </select>
          </label>

          <fieldset className="md:col-span-2">
            <legend className="mb-3 text-sm font-bold">Platforms to scan</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {sourcesLoading && (
                <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3 text-sm font-bold text-secondary">
                  Loading source status...
                </div>
              )}
              {sourceOptions.map((sourceObj) => {
                const selected = selectedSources.includes(sourceObj.id);
                const disabled = !sourceObj.canRun;
                const usesDataset = sourceObj.fallbackAvailable && datasetBackedSources.has(sourceObj.key) && !sourceObj.available;
                const statusLabel = sourceObj.key === 'REDDIT'
                  ? 'Signals'
                  : (usesDataset
                      ? 'Available'
                      : (sourceObj.canRun ? 'Ready' : (sourceObj.key === 'WEBSITE' ? 'Enrich' : (sourceObj.comingSoon ? 'Later' : 'Connect later'))));

                return (
                  <button
                    type="button"
                    key={sourceObj.id}
                    onClick={() => toggleSource(sourceObj)}
                    aria-pressed={selected}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      selected
                        ? 'border-accent bg-accent text-black'
                        : 'border-black/[0.08] bg-[#F7F8F6] text-black hover:bg-white'
                    } ${disabled ? 'cursor-not-allowed opacity-62' : ''}`}
                  >
                    <span>
                      {sourceObj.name}
                      {sourceObj.key === 'REDDIT' && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-secondary">Opportunity Signals</span>
                      )}
                      {usesDataset && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-secondary">Platform signals available</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-secondary">{statusLabel}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="md:col-span-2 mt-2">
            {!isSubmitting && !resultSummary && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto disabled:opacity-70 disabled:hover:bg-black disabled:hover:text-white"
              >
                Start Search
                <ArrowRight size={16} />
              </button>
            )}
            
            {isSubmitting && searchStep !== null && (
              <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] p-5 max-w-lg">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary mb-5">Search in progress</p>
                <div className="flex flex-col gap-4">
                  {SEARCH_STEPS.map((stepLabel, index) => {
                    const isCompleted = searchStep > index;
                    const isActive = searchStep === index;
                    const isUpcoming = searchStep < index;
                    return (
                      <div key={stepLabel} className={`flex items-center gap-3 text-sm font-bold transition-all ${isUpcoming ? 'text-secondary/40' : (isActive ? 'text-black' : 'text-secondary')}`}>
                        {isCompleted ? (
                          <CheckCircle2 size={18} className="text-black" />
                        ) : isActive ? (
                          <Loader2 size={18} className="animate-spin text-accent-dark" />
                        ) : (
                          <div className="h-[18px] w-[18px] rounded-full border-2 border-secondary/20" />
                        )}
                        {stepLabel}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {resultSummary && (
              <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-black" />
                    <div>
                      <h3 className="text-xl font-bold tracking-tight">
                        {resultSummary.count} matching lead{resultSummary.count === 1 ? '' : 's'} found
                      </h3>
                      <p className="mt-1.5 text-sm font-semibold leading-relaxed text-secondary">
                        Search completed across {resultSummary.platformsRequested?.map(p => platformLabel[p] || p).join(', ') || 'selected platforms'}.
                      </p>
                    </div>
                  </div>
                  <div className="flex pl-9">
                    <button
                      type="button"
                      onClick={() => onNavigate?.(`/dashboard/lead-lists${resultSummary.leadListId ? `?listId=${resultSummary.leadListId}` : ''}`)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
                    >
                      View Lead List
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </DashboardCard>

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
              [MapPin, 'Location intent', 'Country and city will shape source queries.'],
              [Globe2, 'Platform mix', `Using ${selectedSources.length} selected platform${selectedSources.length === 1 ? '' : 's'}.`],
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
            Available lead intelligence: {searchOptions.datasetStats?.totalLeads || 0}
          </p>
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardFindLeadsPage;
