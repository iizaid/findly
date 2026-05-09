import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Globe2, Goal, MapPin, Search, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { apiRequest, ApiError } from '../../../lib/api';

const preferredSourceOrder = ['LOCAL_DATASET', 'GOOGLE_MAPS', 'WEBSITE', 'REDDIT', 'YELP', 'SERPAPI', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'TRIPADVISOR', 'YOUTUBE', 'X'];
const datasetBackedSources = new Set(['GOOGLE_MAPS', 'INSTAGRAM', 'FACEBOOK', 'WEBSITE', 'YELP', 'SERPAPI', 'TRIPADVISOR', 'YOUTUBE', 'X', 'LINKEDIN', 'TIKTOK']);

const defaultGoals = ['General opportunity discovery'];

const friendlyErrorMessage = (error) => {
  if (error instanceof ApiError) {
    if (['SOURCE_NOT_CONFIGURED', 'SOURCE_UNAVAILABLE', 'PROVIDER_NOT_CONFIGURED'].includes(error.code)) {
      return 'This source is not connected yet. Search your Local Dataset or select a dataset-backed source.';
    }
    if (error.code === 'VALIDATION_ERROR') {
      return 'Check the search setup fields and try again.';
    }
    return error.message || 'Search could not be completed.';
  }

  return 'Search could not be completed.';
};

const DashboardFindLeadsPage = ({ onNotice, workspace, onNavigate }) => {
  const [selectedSources, setSelectedSources] = useState(['GOOGLE_MAPS']);
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
  const [searchStage, setSearchStage] = useState(null);
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
              || (source.key === 'LOCAL_DATASET' && (source.searchable || source.available))
              || (datasetBackedSources.has(source.key) && source.fallbackAvailable),
          }));
        setSourceOptions(ordered);

        if (ordered.length > 0) {
          const preferred = ordered.find((source) => source.key === 'LOCAL_DATASET' && source.canRun)
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

  const toggleSource = (sourceObj) => {
    if (!sourceObj.canRun) {
      onNotice?.({
        title: sourceObj.key === 'LOCAL_DATASET'
          ? 'Local datasets import from the server'
          : (sourceObj.key === 'REDDIT' ? 'Reddit signals are not connected yet' : 'Source not connected yet'),
        message: sourceObj.key === 'LOCAL_DATASET'
          ? 'Local Dataset is available as a real internal source. Run npm run import:datasets from the server to import Excel/CSV files, then review them in Lead Lists.'
          : (sourceObj.key === 'REDDIT'
            ? 'Reddit will search public demand signals after compliant API access is connected. For now, use Local Dataset search for stored business leads.'
            : 'This source is not connected yet. You can still search your Local Dataset for stored business records.'),
      });
      return;
    }
    setSelectedSources([sourceObj.id]);
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
    setSearchStage('Preparing search...');

    const { service, businessType, goal, country, city, maxResults } = formState;
    
    if (selectedSources.length !== 1) {
      setError('Please select one runnable source to proceed.');
      setIsSubmitting(false);
      return;
    }

    const selectedSource = sourceOptions.find((source) => source.id === selectedSources[0]);
    if (!selectedSource?.canRun) {
      setError(selectedSource?.reason || 'This source is not ready to run yet.');
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

      setSearchStage('Building search campaign...');
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

      setSearchStage(selectedSource?.fallbackAvailable || selectedSource?.key === 'LOCAL_DATASET'
        ? 'Matching imported business records...'
        : 'Searching available data sources...');
      // 3. Run the campaign
      const runRes = await apiRequest(`/api/search/campaigns/${campaignId}/run`, {
        method: 'POST',
      });

      const runData = runRes.data || {};
      setSearchStage('Building lead list...');
      if (runData.fallbackUsed) {
        onNotice?.({
          title: 'Stored data search completed',
          message: 'Findly used your available stored business data for this search.',
        });
      } else if (runData.sourceUsed === 'LOCAL_DATASET') {
        onNotice?.({
          title: 'Local Dataset search completed',
          message: runData.message || 'Results loaded from your Local Dataset.',
        });
      }

      if ((runData.leadsReturned ?? runData.savedLeadsCount ?? 0) === 0) {
        setError('No matching leads found in your imported dataset. Try a broader category, remove the city filter, or import more data.');
        return;
      }

      // Clear the session storage since the campaign was created successfully
      sessionStorage.removeItem('findly_find_leads_state');
      setFormState({ service: '', businessType: '', goal: searchOptions.searchGoals[0] || defaultGoals[0], country: '', city: '', maxResults: 20 });

      setSearchStage('Ready.');
      setResultSummary({
        leadListId: runData.leadListId,
        count: runData.leadsReturned ?? runData.savedLeadsCount ?? 0,
        fallbackUsed: runData.fallbackUsed,
        sourceRequested: runData.sourceRequested,
        sourceUsed: runData.sourceUsed,
      });
      
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
      setSearchStage(null);
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
          Define the service you sell, the business type you want, and the public sources to search.
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
            <legend className="mb-3 text-sm font-bold">Sources to search</legend>
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
                  : (sourceObj.key === 'LOCAL_DATASET'
                    ? (sourceObj.searchable ? 'Ready' : 'Import')
                    : (usesDataset
                      ? 'Uses local data'
                      : (sourceObj.canRun ? 'Ready' : (sourceObj.key === 'WEBSITE' ? 'Enrich' : (sourceObj.comingSoon ? 'Later' : 'Needs key')))));

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
                      {sourceObj.key === 'LOCAL_DATASET' && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-secondary">Excel / CSV import</span>
                      )}
                      {usesDataset && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-secondary">Dataset-backed</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-secondary">{statusLabel}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto disabled:opacity-70 disabled:hover:bg-black disabled:hover:text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running Search...
                </>
              ) : (
                <>
                  Start Search
                  <ArrowRight size={16} />
                </>
              )}
            </button>
            {searchStage && (
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-secondary">{searchStage}</p>
            )}
            {resultSummary && (
              <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-black" />
                  <div>
                    <p className="text-sm font-bold">
                      {resultSummary.count} matching lead{resultSummary.count === 1 ? '' : 's'} saved to a lead list.
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-secondary">
                      {resultSummary.fallbackUsed
                        ? 'Results were loaded from available stored business data.'
                        : 'Search results are ready for review.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(`/dashboard/lead-lists${resultSummary.leadListId ? `?listId=${resultSummary.leadListId}` : ''}`)}
                      className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-black px-4 text-xs font-bold text-white transition-colors hover:bg-accent hover:text-black"
                    >
                      View Lead List
                      <ArrowRight size={14} />
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
            Findly uses connected official sources when available. When external providers are not connected, it searches your imported Local Dataset so you can test the product with real stored leads.
          </p>
          <div className="mt-6 grid gap-3">
            {[
              [Sparkles, 'Service fit', 'Searches will be guided by what the user sells.'],
              [MapPin, 'Location intent', 'Country and city will shape source queries.'],
              [Globe2, 'Source mix', `Using ${selectedSources.length} selected source.`],
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
            Local Dataset searches and fallback searches cost 0 credits during testing. Analysis keeps using the normal Opportunity Credit rules.
          </p>
          <p className="mt-4 rounded-2xl bg-white/8 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
            Imported dataset leads: {searchOptions.datasetStats?.totalLeads || 0}
          </p>
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardFindLeadsPage;
