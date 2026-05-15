import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  DATASET_BACKED_SOURCES,
  DEFAULT_GOALS,
  EMPTY_FORM_STATE,
  MAX_SELECTED_PLATFORMS,
  PLATFORM_LABELS,
  PREFERRED_SOURCE_ORDER,
  STORAGE_KEY,
  delay,
} from './searchConfig';

const friendlyErrorMessage = (error) => {
  if (error instanceof ApiError) {
    if (['SOURCE_NOT_CONFIGURED', 'SOURCE_UNAVAILABLE', 'PROVIDER_NOT_CONFIGURED'].includes(error.code)) {
      return 'Findly could not complete this source right now. Try another source or broaden your search.';
    }
    if (error.code === 'VALIDATION_ERROR') return 'Check the search setup fields and try again.';
    return error.message || 'Search could not be completed.';
  }

  return 'Search could not be completed.';
};

const loadSavedFormState = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : EMPTY_FORM_STATE;
  } catch {
    return EMPTY_FORM_STATE;
  }
};

const normalizeSourceOptions = (sources = []) => [...sources]
  .filter((source) => PREFERRED_SOURCE_ORDER.includes(source.key))
  .sort((a, b) => PREFERRED_SOURCE_ORDER.indexOf(a.key) - PREFERRED_SOURCE_ORDER.indexOf(b.key))
  .map((source) => ({
    ...source,
    id: source.key,
    name: source.label,
    canRun:
      (source.key === 'GOOGLE_MAPS' && (source.available || source.fallbackAvailable))
      || (DATASET_BACKED_SOURCES.has(source.key) && source.fallbackAvailable),
  }));

export const useFindLeadsSearch = ({ workspace }) => {
  const [selectedSources, setSelectedSources] = useState(['INSTAGRAM']);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [searchOptions, setSearchOptions] = useState({
    services: [],
    businessTypes: [],
    countries: [],
    governorates: [],
    cities: [],
    searchGoals: DEFAULT_GOALS,
    maxResultsOptions: [10, 20, 50],
    datasetStats: {},
  });
  const [formState, setFormState] = useState(loadSavedFormState);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [searchStep, setSearchStep] = useState(null);
  const [resultSummary, setResultSummary] = useState(null);

  const selectedPlatformNames = useMemo(
    () => selectedSources.map((source) => PLATFORM_LABELS[source] || source).join(', '),
    [selectedSources],
  );

  useEffect(() => {
    let mounted = true;

    apiRequest('/api/search/options')
      .then((response) => {
        if (!mounted) return;
        const nextOptions = response.data || {};
        const searchGoals = nextOptions.searchGoals || DEFAULT_GOALS;
        const orderedSources = normalizeSourceOptions(nextOptions.sources || []);

        setSearchOptions({
          services: nextOptions.services || [],
          businessTypes: nextOptions.businessTypes || [],
          countries: nextOptions.countries || [],
          governorates: nextOptions.governorates || nextOptions.cities || [],
          cities: nextOptions.cities || [],
          searchGoals,
          maxResultsOptions: nextOptions.maxResultsOptions || [10, 20, 50],
          datasetStats: nextOptions.datasetStats || {},
        });
        setSourceOptions(orderedSources);
        setFormState((current) => ({ ...current, goal: current.goal || searchGoals[0] || DEFAULT_GOALS[0] }));

        const preferred = orderedSources.find((source) => source.key === 'INSTAGRAM' && source.canRun)
          || orderedSources.find((source) => source.key === 'GOOGLE_MAPS' && source.canRun)
          || orderedSources.find((source) => source.canRun);

        if (preferred) {
          setSelectedSources((current) => (
            current.some((id) => orderedSources.some((source) => source.id === id && source.canRun))
              ? current
              : [preferred.id]
          ));
        }
      })
      .catch(() => {
        if (!mounted) return;
        setSourceOptions([]);
        setError('Platform status could not be loaded. Refresh the page and try again.');
      })
      .finally(() => {
        if (mounted) setSourcesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const clearResultSummary = () => setResultSummary(null);

  const updateField = (field, value) => {
    clearResultSummary();
    const next = { ...formState, [field]: value };
    setFormState(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleSource = (sourceObj) => {
    if (!sourceObj.canRun) {
      setError('This source is not available for search yet. Choose a searchable source to continue.');
      return;
    }

    setError(null);
    clearResultSummary();
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

  const resetForNewSearch = () => {
    setError(null);
    clearResultSummary();
  };

  const runSearch = async () => {
    setError(null);
    clearResultSummary();

    if (selectedSources.length < 1) {
      setError('Please select at least one platform to proceed.');
      return;
    }

    const unreadySource = selectedSources.find((id) => !sourceOptions.find((source) => source.id === id)?.canRun);
    if (unreadySource) {
      setError('One of the selected platforms is not ready to run yet.');
      return;
    }

    const { service, businessType, goal, country, city, maxResults } = formState;
    if (!service || !businessType || !goal || !country || !city) {
      setError('Complete the service, business type, goal, country, and governorate before starting the search.');
      return;
    }

    setIsSubmitting(true);
    setSearchStep(0);

    try {
      await delay(250);
      const profileRes = await apiRequest('/api/search/profiles', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: workspace?.id,
          name: `${service} Profile`,
          serviceType: service,
          targetBusinessTypes: [businessType],
          targetLocations: [city, country],
          idealSignals: [goal],
        }),
      });

      setSearchStep(1);
      await delay(300);

      const campaignRes = await apiRequest('/api/search/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: workspace?.id,
          name: `${businessType} in ${city}`,
          serviceProfileId: profileRes.data.profile.id,
          businessTypes: [businessType],
          country,
          city,
          sources: selectedSources,
          filters: { goal },
          requestedLimit: Number(maxResults) || 20,
        }),
      });

      setSearchStep(2);
      await delay(300);

      const runRes = await apiRequest(`/api/search/campaigns/${campaignRes.data.campaign.id}/run`, { method: 'POST' });
      const runData = runRes.data || {};
      const leadsReturned = runData.leadsReturned ?? runData.savedLeadsCount ?? 0;

      setSearchStep(3);
      await delay(300);

      if (leadsReturned === 0) {
        setError('No matching leads found. Try broader filters, a different location, or fewer platform constraints.');
        return;
      }

      setSearchStep(4);
      await delay(250);

      sessionStorage.removeItem(STORAGE_KEY);
      setFormState({ ...EMPTY_FORM_STATE, goal: searchOptions.searchGoals[0] || DEFAULT_GOALS[0] });
      setResultSummary({
        leadListId: runData.leadListId,
        count: leadsReturned,
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

  return {
    selectedSources,
    sourceOptions,
    searchOptions,
    formState,
    sourcesLoading,
    isSubmitting,
    error,
    searchStep,
    resultSummary,
    selectedPlatformNames,
    updateField,
    toggleSource,
    resetForNewSearch,
    runSearch,
  };
};
