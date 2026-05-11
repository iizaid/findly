import { ArrowRight, Search, AlertCircle, WalletCards } from 'lucide-react';
import DashboardCard from '../../DashboardCard';
import SearchRunningOverlay from '../../SearchRunningOverlay';
import { useFindLeadsSearch } from './useFindLeadsSearch';
import { SEARCH_STEPS } from './searchConfig';
import PlatformButton from './PlatformButton';
import SearchResultSummary from './SearchResultSummary';
import SearchSelect from './SearchSelect';
import SearchSidePanel from './SearchSidePanel';

const fieldClass = 'h-12 w-full rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-sm font-semibold outline-none transition-colors focus:border-black/20 focus:bg-white';

const FindLeadsView = ({ workspace, onNavigate }) => {
  const search = useFindLeadsSearch({ workspace });
  const locationOptions = search.searchOptions.governorates?.length
    ? search.searchOptions.governorates
    : search.searchOptions.cities;

  const submit = (event) => {
    event.preventDefault();
    search.runSearch();
  };

  return (
    <>
      <SearchRunningOverlay
        isVisible={search.isSubmitting && search.searchStep !== null}
        currentStep={search.searchStep || 0}
        steps={SEARCH_STEPS}
        selectedPlatforms={search.selectedSources}
        criteria={search.formState}
      />

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

          {search.error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold">{search.error}</p>
            </div>
          )}

          <form className="mt-7 grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <SearchSelect label="Service you offer" value={search.formState.service} onChange={(value) => search.updateField('service', value)} options={search.searchOptions.services} placeholder="Select a service" wide required />
            <SearchSelect label="Target business type" value={search.formState.businessType} onChange={(value) => search.updateField('businessType', value)} options={search.searchOptions.businessTypes} placeholder="Select a business type" required />
            <SearchSelect label="Search goal" value={search.formState.goal} onChange={(value) => search.updateField('goal', value)} options={search.searchOptions.searchGoals} />
            <SearchSelect label="Country" value={search.formState.country} onChange={(value) => search.updateField('country', value)} options={search.searchOptions.countries} placeholder="Select a country" required />
            <SearchSelect label="Governorate" value={search.formState.city} onChange={(value) => search.updateField('city', value)} options={locationOptions} placeholder="Select a governorate" required />

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-bold">Max results</span>
              <select value={search.formState.maxResults} onChange={(event) => search.updateField('maxResults', Number(event.target.value))} className={`${fieldClass} md:w-48`}>
                {search.searchOptions.maxResultsOptions.map((limit) => <option key={limit} value={limit}>{limit} leads</option>)}
              </select>
            </label>

            <fieldset className="md:col-span-2">
              <legend className="mb-3 text-sm font-bold">Platforms to scan</legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {search.sourcesLoading && (
                  <div className="rounded-2xl border border-black/[0.08] bg-[#F7F8F6] px-4 py-3 text-sm font-bold text-secondary">
                    Loading platform status...
                  </div>
                )}
                {search.sourceOptions.map((source) => (
                  <PlatformButton key={source.id} source={source} selected={search.selectedSources.includes(source.id)} onClick={() => search.toggleSource(source)} />
                ))}
              </div>
            </fieldset>

            <div className="md:col-span-2 rounded-[26px] border border-black/[0.08] bg-[#F7F8F6] p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-black">
                    <WalletCards size={18} />
                    Estimated maximum cost: {search.estimatedCredits} credits
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-6 text-secondary">
                    Backend reserves this maximum before search, then refunds unused credits if fewer leads are returned. A base search cost is charged even when no leads match.
                  </p>
                </div>
                <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-secondary">
                  5 base + 1 per requested lead
                </div>
              </div>
              {search.selectedSourceModes.length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {search.selectedSourceModes.map((source) => (
                    <div key={source.id} className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-sm font-bold text-black">{source.label}</p>
                      <p className="mt-1 text-xs font-semibold text-secondary">{source.mode}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2 mt-2">
              {!search.isSubmitting && !search.resultSummary && (
                <button type="submit" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black sm:w-auto">
                  Start Search • Reserve {search.estimatedCredits} credits
                  <ArrowRight size={16} />
                </button>
              )}
              {search.resultSummary && (
                <SearchResultSummary resultSummary={search.resultSummary} onNavigate={onNavigate} onStartNew={search.resetForNewSearch} />
              )}
            </div>
          </form>
        </DashboardCard>

        <SearchSidePanel selectedPlatformCount={search.selectedSources.length} selectedPlatformNames={search.selectedPlatformNames} totalLeads={search.searchOptions.datasetStats?.totalLeads || 0} />
      </div>
    </>
  );
};

export default FindLeadsView;
