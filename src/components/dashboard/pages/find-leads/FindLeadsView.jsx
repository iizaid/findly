import { ArrowRight, AlertCircle, Search } from 'lucide-react';
import DashboardCard from '../../DashboardCard';
import SearchRunningOverlay from '../../SearchRunningOverlay';
import { useFindLeadsSearch } from './useFindLeadsSearch';
import { SEARCH_STEPS } from './searchConfig';
import PlatformButton from './PlatformButton';
import SearchResultSummary from './SearchResultSummary';
import SearchSelect from './SearchSelect';
import SearchSidePanel from './SearchSidePanel';

const FindLeadsView = ({ workspace, onNavigate, onUpdate }) => {
  const search = useFindLeadsSearch({ workspace, onUpdate });
  const locationOptions = search.searchOptions.governorates?.length
    ? search.searchOptions.governorates
    : search.searchOptions.cities;
  const submitDisabled = search.sourcesLoading;

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
        pendingSearch={search.pendingSearch}
        onCancel={() => {
          search.cancelPendingSearch();
          // Reset submitting so modal closes
        }}
        onCheckStatus={search.checkPendingSearchStatus}
        onViewLeadLists={() => onNavigate('/dashboard/lead-lists')}
      />

      <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <DashboardCard className="p-5 md:p-7">
          <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Findly search console</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-black md:text-4xl">Find Leads</h2>
              <p className="mt-2 max-w-2xl text-[14px] font-semibold leading-6 text-black/50">
                Choose your offer, audience, location, and the source signals Findly should use.
              </p>
            </div>
            <span className="inline-flex h-11 items-center gap-2 self-start rounded-2xl border border-black/[0.08] bg-black/[0.025] px-4 text-[12px] font-bold text-black">
              <Search size={15} />
              Search setup
            </span>
          </div>

          {search.error && !search.pendingSearch && (
            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
              <div className="flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold">{search.error}</p>
              </div>
            </div>
          )}

          {!search.error && search.pendingSearch && !search.isSubmitting && (
            <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-200 text-yellow-800">
                  <AlertCircle size={14} />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-yellow-900">Search is still running</h3>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-yellow-800/80">
                    Your search is taking longer than expected. It is safely running in the background. You can check the status again or cancel it if you prefer.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 pl-9">
                <button
                  type="button"
                  onClick={search.checkPendingSearchStatus}
                  className="inline-flex h-9 items-center rounded-full bg-black px-4 text-xs font-bold text-white transition-colors hover:bg-black/80"
                >
                  Check Status Again
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/dashboard/lead-lists')}
                  className="inline-flex h-9 items-center rounded-full border border-black/10 bg-white px-4 text-xs font-bold text-black transition-colors hover:bg-black/5"
                >
                  View Lead Lists
                </button>
                <button
                  type="button"
                  onClick={search.cancelPendingSearch}
                  className="inline-flex h-9 items-center rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
                >
                  Cancel Search
                </button>
              </div>
            </div>
          )}

          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <SearchSelect label="Service you offer" value={search.formState.service} onChange={(value) => search.updateField('service', value)} options={search.searchOptions.services} placeholder="Select a service" wide required />
            <SearchSelect label="Target business type" value={search.formState.businessType} onChange={(value) => search.updateField('businessType', value)} options={search.searchOptions.businessTypes} placeholder="Select a business type" required />
            <SearchSelect label="Search goal" value={search.formState.goal} onChange={(value) => search.updateField('goal', value)} options={search.searchOptions.searchGoals} />
            <SearchSelect label="Country" value={search.formState.country} onChange={(value) => search.updateField('country', value)} options={search.searchOptions.countries} placeholder="Select a country" required />
            <SearchSelect label="Governorate" value={search.formState.city} onChange={(value) => search.updateField('city', value)} options={locationOptions} placeholder="Select a governorate" required />

            <label className="md:col-span-2">
              <span className="mb-2 block text-[13px] font-semibold text-black">Max results</span>
              <div className="flex flex-wrap gap-2">
                {search.searchOptions.maxResultsOptions.map((limit) => {
                  const selected = Number(search.formState.maxResults) === Number(limit);
                  return (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => search.updateField('maxResults', Number(limit))}
                      className={`h-10 rounded-2xl border px-4 text-[13px] font-bold transition-all ${
                        selected
                          ? 'border-black bg-black text-white shadow-[0_10px_26px_rgba(0,0,0,0.14)]'
                          : 'border-black/[0.08] bg-white text-black hover:border-black/20 hover:bg-black/[0.025]'
                      }`}
                    >
                      {limit} leads
                    </button>
                  );
                })}
              </div>
            </label>

            <fieldset className="md:col-span-2 mt-3 rounded-[24px] border border-black/[0.06] bg-black/[0.015] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <legend className="text-[13px] font-bold text-black">Search sources</legend>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-secondary">
                  {search.selectedSources.length} selected
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {search.sourcesLoading && (
                  <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 text-[13px] font-medium text-black/50">
                    Loading platform status...
                  </div>
                )}
                {search.sourceOptions.map((source) => (
                  <PlatformButton key={source.id} source={source} selected={search.selectedSources.includes(source.id)} onClick={() => search.toggleSource(source)} />
                ))}
              </div>
            </fieldset>

            <div className="md:col-span-2 mt-4">
              {!search.isSubmitting && !search.resultSummary && (
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md outline-none transition-all hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {search.sourcesLoading ? 'Loading sources...' : 'Start Search'}
                  {!search.sourcesLoading && <ArrowRight size={16} />}
                </button>
              )}
              {search.resultSummary && (
                <SearchResultSummary resultSummary={search.resultSummary} onNavigate={onNavigate} onStartNew={search.resetForNewSearch} />
              )}
            </div>
          </form>
        </DashboardCard>

        <SearchSidePanel selectedPlatformCount={search.selectedSources.length} selectedPlatformNames={search.selectedPlatformNames} />
      </div>
    </>
  );
};

export default FindLeadsView;
