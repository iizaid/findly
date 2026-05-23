import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '../../../../lib/api';
import {
  DEFAULT_GOALS,
  EMPTY_FORM_STATE,
  MAX_SELECTED_DISCOVERY_SOURCES,
  MAX_SELECTED_PRESENCE_TARGETS,
  PLATFORM_LABELS,
  PREFERRED_DISCOVERY_SOURCE_ORDER,
  PREFERRED_PRESENCE_TARGET_ORDER,
  STORAGE_KEY,
  delay,
} from './searchConfig';

const friendlyErrorMessage = (error) => {
  if (error instanceof ApiError) {
    if (['SOURCE_NOT_CONFIGURED', 'SOURCE_UNAVAILABLE', 'PROVIDER_NOT_CONFIGURED'].includes(error.code)) {
      return 'One discovery layer could not run, but Findly will continue with the available discovery layers.';
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

const buildCampaignQuery = ({ service, businessType, goal, city, country, presenceTargets = [] }) => {
  const subject = [businessType, service].filter(Boolean).join(' for ');
  const geography = [city, country].filter(Boolean).join(', ');
  const intent = goal ? ` - ${goal}` : '';
  const focus = presenceTargets.length
    ? ` - focus on ${presenceTargets.map((target) => PLATFORM_LABELS[target] || target).join(', ')} public presence`
    : '';
  return [subject, geography].filter(Boolean).join(' in ') + intent + focus;
};

const normalizeOptions = (items = [], order = []) => [...items]
  .filter((item) => order.includes(item.key))
  .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  .map((source) => ({
    ...source,
    id: source.key,
    name: PLATFORM_LABELS[source.key] || source.label || source.key,
    canRun: source.kind === 'presence_target'
      ? Boolean(source.selectable !== false)
      : Boolean(source.searchable || source.available),
  }));

const pollCampaignStatus = async (campaignId, jobId = null) => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await delay(1000);
    const response = await apiRequest(`/api/search/campaigns/${campaignId}/status`);
    const campaign = response.data.campaign;

    if (campaign.status === 'COMPLETED') return campaign;
    if (campaign.status === 'FAILED') {
      throw new ApiError(campaign.errorCode || 'CAMPAIGN_FAILED', campaign.errorMessage || 'Search could not be completed.', 400);
    }
  }

  const error = new ApiError('SEARCH_STILL_RUNNING', 'Search is still running. You can check the status again, open Lead Lists, or cancel the search.', 202);
  error.campaignId = campaignId;
  error.jobId = jobId;
  throw error;
};

export const useFindLeadsSearch = ({ workspace, onUpdate }) => {
  const [selectedDiscoverySources, setSelectedDiscoverySources] = useState([]);
  const [selectedPresenceTargets, setSelectedPresenceTargets] = useState(['INSTAGRAM']);
  const [discoverySourceOptions, setDiscoverySourceOptions] = useState([]);
  const [presenceTargetOptions, setPresenceTargetOptions] = useState([]);
  const [searchOptions, setSearchOptions] = useState({
    services: [],
    businessTypes: [],
    countries: [],
    governorates: [],
    cities: [],
    searchGoals: DEFAULT_GOALS,
    maxResultsOptions: [10, 20, 50],
  });
  const [formState, setFormState] = useState(loadSavedFormState);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [searchStep, setSearchStep] = useState(null);
  const [resultSummary, setResultSummary] = useState(null);
  const [pendingSearch, setPendingSearch] = useState(null);

  const selectedDiscoveryNames = useMemo(
    () => selectedDiscoverySources.map((source) => PLATFORM_LABELS[source] || source).join(', '),
    [selectedDiscoverySources],
  );

  const selectedPresenceNames = useMemo(
    () => selectedPresenceTargets.map((source) => PLATFORM_LABELS[source] || source).join(', '),
    [selectedPresenceTargets],
  );

  const selectedSourceWarnings = useMemo(
    () => discoverySourceOptions
      .filter((source) => selectedDiscoverySources.includes(source.id) && source.warning)
      .map((source) => source.warning),
    [discoverySourceOptions, selectedDiscoverySources],
  );

  useEffect(() => {
    let mounted = true;

    apiRequest('/api/search/options')
      .then((response) => {
        if (!mounted) return;
        const nextOptions = response.data || {};
        const searchGoals = nextOptions.searchGoals || DEFAULT_GOALS;
        const orderedSources = normalizeOptions(nextOptions.sources || [], PREFERRED_DISCOVERY_SOURCE_ORDER);
        const orderedPresenceTargets = normalizeOptions(nextOptions.presenceTargets || [], PREFERRED_PRESENCE_TARGET_ORDER);

        setSearchOptions({
          services: nextOptions.services || [],
          businessTypes: nextOptions.businessTypes || [],
          countries: nextOptions.countries || [],
          governorates: nextOptions.governorates || nextOptions.cities || [],
          cities: nextOptions.cities || [],
          searchGoals,
          maxResultsOptions: nextOptions.maxResultsOptions || [10, 20, 50],
        });
        setDiscoverySourceOptions(orderedSources);
        setPresenceTargetOptions(orderedPresenceTargets);
        setFormState((current) => ({ ...current, goal: current.goal || searchGoals[0] || DEFAULT_GOALS[0] }));

        const preferred = orderedSources.find((source) => source.key === 'GOOGLE_MAPS' && source.canRun)
          || orderedSources.find((source) => source.key === 'WEBSITE' && source.canRun)
          || orderedSources.find((source) => source.canRun);

        if (preferred) {
          setSelectedDiscoverySources((current) => (
            current.some((id) => orderedSources.some((source) => source.id === id && source.canRun))
              ? current
              : [preferred.id]
          ));
        }

        const preferredTarget = orderedPresenceTargets.find((target) => target.key === 'INSTAGRAM')
          || orderedPresenceTargets[0];
        if (preferredTarget) {
          setSelectedPresenceTargets((current) => (
            current.some((id) => orderedPresenceTargets.some((target) => target.id === id))
              ? current
              : [preferredTarget.id]
          ));
        }
      })
      .catch(() => {
        if (!mounted) return;
        setDiscoverySourceOptions([]);
        setPresenceTargetOptions([]);
        setError('Source status could not be loaded. Refresh the page and try again.');
      })
      .finally(() => {
        if (mounted) setSourcesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const clearResultSummary = () => {
    setResultSummary(null);
    setPendingSearch(null);
  };

  const updateField = (field, value) => {
    clearResultSummary();
    const next = { ...formState, [field]: value };
    setFormState(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleDiscoverySource = (sourceObj) => {
    if (!sourceObj.canRun) {
      setError('This source is not available for search yet. Choose an available source to continue.');
      return;
    }

    setError(null);
    clearResultSummary();
    setSelectedDiscoverySources((current) => {
      if (current.includes(sourceObj.id)) {
        return current.length === 1 ? current : current.filter((id) => id !== sourceObj.id);
      }
      if (current.length >= MAX_SELECTED_DISCOVERY_SOURCES) {
        setError(`You can select up to ${MAX_SELECTED_DISCOVERY_SOURCES} discovery sources per search.`);
        return current;
      }
      return [...current, sourceObj.id];
    });
  };

  const togglePresenceTarget = (sourceObj) => {
    if (sourceObj.selectable === false) return;

    setError(null);
    clearResultSummary();
    setSelectedPresenceTargets((current) => {
      if (current.includes(sourceObj.id)) {
        return current.filter((id) => id !== sourceObj.id);
      }
      if (current.length >= MAX_SELECTED_PRESENCE_TARGETS) {
        setError(`You can select up to ${MAX_SELECTED_PRESENCE_TARGETS} focus targets per search.`);
        return current;
      }
      return [...current, sourceObj.id];
    });
  };

  const resetForNewSearch = () => {
    setError(null);
    clearResultSummary();
  };

  const applyCompletedCampaign = (campaign, runData = {}) => {
    const leadsReturned = campaign.resultCount ?? campaign.leadsReturned ?? campaign.savedLeadsCount ?? 0;

    sessionStorage.removeItem(STORAGE_KEY);
    setFormState({ ...EMPTY_FORM_STATE, goal: searchOptions.searchGoals[0] || DEFAULT_GOALS[0] });
    setPendingSearch(null);
    setResultSummary({
      leadListId: campaign.leadListId || runData.leadListId,
      count: leadsReturned,
      discoverySourcesRequested: selectedDiscoverySources,
      presenceTargetsRequested: selectedPresenceTargets,
      layerSummary: campaign.layerSummary || [],
      message: campaign.message || null,
      providerWarnings: selectedSourceWarnings,
    });
    onUpdate?.();
  };

  const checkPendingSearchStatus = async () => {
    if (!pendingSearch?.campaignId) return;
    setError(null);
    setIsSubmitting(true);
    setSearchStep(3);

    try {
      const response = await apiRequest(`/api/search/campaigns/${pendingSearch.campaignId}/status`);
      const campaign = response.data.campaign;

      if (campaign.status === 'COMPLETED') {
        applyCompletedCampaign(campaign, { jobId: pendingSearch.jobId });
      } else if (campaign.status === 'FAILED') {
        setPendingSearch(null);
        setError(campaign.errorMessage || 'Search could not be completed.');
        onUpdate?.();
      } else if (campaign.status === 'CANCELLED') {
        setPendingSearch(null);
        setError('Search was cancelled. Any reserved credits were released.');
        onUpdate?.();
      } else {
        setError(null);
        // keep pendingSearch set so the recovery card continues to show
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
      setSearchStep(null);
    }
  };

  const cancelPendingSearch = async () => {
    if (!pendingSearch?.campaignId) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await apiRequest(`/api/search/campaigns/${pendingSearch.campaignId}/cancel`, { method: 'POST' });
      setPendingSearch(null);
      setError('Search was cancelled. Any reserved credits were released.');
      onUpdate?.();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
      setSearchStep(null);
    }
  };

  const runSearch = async () => {
    setError(null);
    clearResultSummary();

    if (sourcesLoading) {
      setError('Search sources are still loading. Please wait a moment and try again.');
      return;
    }

    if (selectedDiscoverySources.length < 1) {
      setError('Please select at least one source to proceed.');
      return;
    }

    const unreadySource = selectedDiscoverySources.find((id) => !discoverySourceOptions.find((source) => source.id === id)?.canRun);
    if (unreadySource) {
      setError('One of the selected sources is not ready to run yet.');
      return;
    }

    const { service, businessType, goal, country, city, maxResults } = formState;
    if (!service || !businessType || !goal || !country || !city) {
      setError('Complete the service, business type, goal, country, and governorate before starting the search.');
      return;
    }
    if (!workspace?.id) {
      setError('Workspace context is still loading. Refresh the page and try again.');
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
          query: buildCampaignQuery({ service, businessType, goal, city, country, presenceTargets: selectedPresenceTargets }),
          serviceProfileId: profileRes.data.profile.id,
          businessTypes: [businessType],
          country,
          city,
          sources: selectedDiscoverySources,
          presenceTargets: selectedPresenceTargets,
          filters: {
            goal,
            presenceTargets: selectedPresenceTargets,
            presenceTargetMode: 'prioritize',
          },
          requestedLimit: Number(maxResults) || 20,
        }),
      });

      setSearchStep(2);
      await delay(300);

      const runRes = await apiRequest(`/api/search/campaigns/${campaignRes.data.campaign.id}/run`, { method: 'POST' });
      const runData = runRes.data || {};

      setSearchStep(3);
      if (runData.status === 'QUEUED') {
        setPendingSearch({ campaignId: campaignRes.data.campaign.id, jobId: runData.jobId });
      }

      const completedCampaign = runData.status === 'QUEUED'
        ? await pollCampaignStatus(campaignRes.data.campaign.id, runData.jobId)
        : runData;

      setSearchStep(4);
      await delay(250);
      applyCompletedCampaign(completedCampaign, runData);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SEARCH_STILL_RUNNING') {
        // pendingSearch is already set above, just stop the spinner
        setError(null);
      } else {
        setError(friendlyErrorMessage(err));
      }
      onUpdate?.();
    } finally {
      setIsSubmitting(false);
      setSearchStep(null);
    }
  };

  return {
    selectedDiscoverySources,
    selectedPresenceTargets,
    discoverySourceOptions,
    presenceTargetOptions,
    searchOptions,
    formState,
    sourcesLoading,
    isSubmitting,
    error,
    searchStep,
    resultSummary,
    pendingSearch,
    selectedDiscoveryNames,
    selectedPresenceNames,
    selectedSourceWarnings,
    updateField,
    toggleDiscoverySource,
    togglePresenceTarget,
    resetForNewSearch,
    checkPendingSearchStatus,
    cancelPendingSearch,
    runSearch,
  };
};
