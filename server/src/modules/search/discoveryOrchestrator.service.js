import { env } from '../../config/env.js';
import { GooglePlacesAdapter } from './adapters/GooglePlacesAdapter.js';
import { LocalDatasetAdapter } from './adapters/LocalDatasetAdapter.js';
import { SerpAdapter } from './adapters/SerpAdapter.js';
import { buildDiscoveryPlan as buildCacheFirstDecision } from './discoveryDecisionEngine.service.js';
import { convertEvidenceToReusableLeadCandidates, findReusableEvidenceCandidates } from './evidenceCache.service.js';
import { collectOpenWebEvidenceCandidates } from './openWebEvidence.service.js';
import { assessLeadCandidateQuality } from './leadQuality.service.js';
import { getSearchMetadataProviderStatus } from './metadataProviders/searchMetadataProviderRegistry.js';
import { normalizeCampaignTargeting } from './sourceTargetMapping.service.js';
import { getSourceStatusByKey } from './source.registry.js';
import { scoreLeadCandidate } from './leadScoring.service.js';

export const DISCOVERY_LAYER_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
  NO_RESULTS: 'NO_RESULTS',
});

export const DISCOVERY_LAYER_KEYS = Object.freeze({
  CACHE_EVIDENCE: 'CACHE_EVIDENCE',
  LOCAL_DATASET: 'LOCAL_DATASET',
  SEARCH_METADATA: 'SEARCH_METADATA',
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  WEBSITE_OPEN_WEB: 'WEBSITE_OPEN_WEB',
  FUTURE_PROVIDER: 'FUTURE_PROVIDER',
});

const unique = (values = []) => [...new Set(values.filter(Boolean))];
const compact = (value) => (value || '').toString().trim().toLowerCase();

const normalizeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return null;
  }
};

const normalizePhone = (value) => {
  const digits = (value || '').toString().replace(/[^\d+]/g, '');
  return digits.length >= 7 ? digits : null;
};

const normalizeName = (value) => compact(value).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

const categoryVariants = {
  cafes: ['cafe', 'coffee shop', 'specialty coffee', 'roastery'],
  clinics: ['clinic', 'medical clinic', 'dental clinic', 'physiotherapy', 'spa clinic', 'aesthetic clinic'],
  restaurants: ['restaurant', 'grill', 'shawarma', 'burger', 'pizza'],
  salons: ['salon', 'beauty center', 'hair salon', 'nails'],
  gyms: ['gym', 'fitness center', 'personal training'],
};

const queryLabel = (key) => ({
  [DISCOVERY_LAYER_KEYS.CACHE_EVIDENCE]: 'Cached evidence',
  [DISCOVERY_LAYER_KEYS.LOCAL_DATASET]: 'Local dataset',
  [DISCOVERY_LAYER_KEYS.SEARCH_METADATA]: 'Search Metadata',
  [DISCOVERY_LAYER_KEYS.GOOGLE_PLACES]: 'Google Places',
  [DISCOVERY_LAYER_KEYS.WEBSITE_OPEN_WEB]: 'Website and open web',
  [DISCOVERY_LAYER_KEYS.FUTURE_PROVIDER]: 'Future provider',
}[key] || key);

const makeLayerResult = ({
  layerKey,
  provider = null,
  status = DISCOVERY_LAYER_STATUS.SKIPPED,
  configured = false,
  attempted = false,
  queryVariantsUsed = [],
  rawCount = 0,
  acceptedCount = 0,
  rejectedCount = 0,
  dedupedCount = 0,
  durationMs = 0,
  costUnits = 0,
  reason = null,
  warnings = [],
  rejectedLowQuality = 0,
  rejectedGeneratedName = 0,
  rejectedMissingBusinessEvidence = 0,
  rejectedWrongLocation = 0,
  rejectedDuplicate = 0,
} = {}) => ({
  layerKey,
  provider,
  status,
  configured,
  attempted,
  queryVariantsUsed,
  rawCount,
  acceptedCount,
  rejectedCount,
  dedupedCount,
  durationMs,
  costUnits,
  reason,
  warnings,
  rejectedLowQuality,
  rejectedGeneratedName,
  rejectedMissingBusinessEvidence,
  rejectedWrongLocation,
  rejectedDuplicate,
  label: queryLabel(layerKey),
});

const createRejectionCounts = () => ({
  rejectedLowQuality: 0,
  rejectedGeneratedName: 0,
  rejectedMissingBusinessEvidence: 0,
  rejectedWrongLocation: 0,
  rejectedDuplicate: 0,
});

const registerRejection = (counts, code) => {
  if (code === 'REJECTED_GENERATED_NAME') counts.rejectedGeneratedName += 1;
  else if (code === 'REJECTED_MISSING_BUSINESS_EVIDENCE') counts.rejectedMissingBusinessEvidence += 1;
  else if (code === 'REJECTED_WRONG_LOCATION') counts.rejectedWrongLocation += 1;
  else if (code === 'REJECTED_DUPLICATE') counts.rejectedDuplicate += 1;
  else counts.rejectedLowQuality += 1;
};

export const buildQueryVariants = (campaign = {}) => {
  const businessType = Array.isArray(campaign.businessTypes) ? campaign.businessTypes[0] : null;
  const city = campaign.city || '';
  const country = campaign.country || '';
  const goal = campaign.filters?.goal || campaign.query || '';
  const service = campaign.serviceProfile?.serviceType || goal || '';
  const presenceTargets = normalizeCampaignTargeting(campaign).presenceTargets;
  const maxVariants = Math.max(3, Math.min(Number(env.DISCOVERY_MAX_QUERY_VARIANTS) || 6, 8));
  const baseLocation = [city, country].filter(Boolean).join(' ');
  const bucket = Object.entries(categoryVariants).find(([, terms]) => terms.some((term) => compact(businessType).includes(compact(term))))?.[0] || null;
  const categoryTerms = bucket ? categoryVariants[bucket] : [businessType].filter(Boolean);
  const variants = [];

  const orderedCategoryTerms = unique(categoryTerms);
  if (orderedCategoryTerms[0]) {
    const term = orderedCategoryTerms[0];
    variants.push(`${term} in ${baseLocation}`.trim());
    if (service) variants.push(`${term} ${city} ${service}`.trim());
  }

  for (const target of presenceTargets) {
    variants.push(`${businessType || 'business'} ${city} ${target}`.trim());
  }

  if (goal) variants.push(`${businessType || 'business'} ${city} ${goal}`.trim());
  variants.push(`${businessType || 'business'} ${city} contact`.trim());
  variants.push(`${businessType || 'business'} ${city} website`.trim());
  variants.push(`${businessType || 'business'} ${city} booking`.trim());

  for (const term of orderedCategoryTerms.slice(1)) {
    variants.push(`${term} in ${baseLocation}`.trim());
    if (service) variants.push(`${term} ${city} ${service}`.trim());
  }

  return unique(variants.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)).slice(0, maxVariants);
};

const candidateKeyFor = (candidate = {}) => {
  const website = normalizeUrl(candidate.websiteUrl || candidate.sourceUrl);
  const phone = normalizePhone(candidate.phone);
  const social = normalizeUrl(candidate.instagramUrl || candidate.facebookUrl || candidate.googleMapsUrl);
  const nameCity = `${normalizeName(candidate.businessName || candidate.title)}:${compact(candidate.city)}`;
  const sourceKey = candidate.source && candidate.sourceId ? `${candidate.source}:${candidate.sourceId}` : null;
  return website || phone || social || sourceKey || nameCity;
};

const normalizeCatalogCandidate = (lead, campaign) => {
  const score = scoreLeadCandidate({
    lead,
    campaign,
    sourceConfidence: lead.localDatasetScore ?? 70,
  });
  return {
    type: 'catalog',
    catalogLeadId: lead.catalogLeadId || lead.id,
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    country: lead.country,
    address: lead.address,
    phone: lead.phone,
    websiteUrl: lead.websiteUrl,
    instagramUrl: lead.instagramUrl,
    facebookUrl: lead.facebookUrl,
    googleMapsUrl: lead.googleMapsUrl,
    source: lead.source,
    sourceId: lead.sourceId || null,
    evidence: null,
    score,
    dedupeKey: candidateKeyFor(lead),
    raw: lead,
  };
};

const normalizeEvidenceCandidate = (candidate, campaign, provider) => {
  const fields = candidate.extractedFields || {};
  const score = scoreLeadCandidate({
    lead: {
      businessName: fields.businessName || candidate.title,
      category: fields.category,
      city: fields.city || campaign.city,
      country: fields.country || campaign.country,
      address: fields.address || null,
      phone: fields.phone || null,
      websiteUrl: fields.websiteUrl || candidate.sourceUrl,
      instagramUrl: fields.platformUrl || null,
      facebookUrl: fields.facebookUrl || null,
      googleMapsUrl: fields.googleMapsUrl || null,
      rating: fields.rating || null,
      reviewCount: fields.reviewCount || null,
      source: provider,
      rawData: candidate.rawMetadata || {},
    },
    campaign,
    sourceConfidence: candidate.confidenceScore || 50,
  });

  return {
    type: 'evidence',
    businessName: fields.businessName || candidate.title,
    category: fields.category || null,
    city: fields.city || campaign.city || null,
    country: fields.country || campaign.country || null,
    address: fields.address || null,
    phone: fields.phone || null,
    websiteUrl: fields.websiteUrl || candidate.sourceUrl,
    instagramUrl: fields.platformUrl || null,
    facebookUrl: fields.facebookUrl || null,
    googleMapsUrl: fields.googleMapsUrl || null,
    source: provider,
    sourceId: candidate.externalId || null,
    evidence: candidate,
    score,
    dedupeKey: candidateKeyFor({
      businessName: fields.businessName || candidate.title,
      city: fields.city || campaign.city,
      websiteUrl: fields.websiteUrl || candidate.sourceUrl,
      phone: fields.phone || null,
      instagramUrl: fields.platformUrl || null,
      facebookUrl: fields.facebookUrl || null,
      googleMapsUrl: fields.googleMapsUrl || null,
      source: provider,
      sourceId: candidate.externalId || null,
    }),
    raw: candidate,
  };
};

const normalizeGoogleLeadToEvidence = (lead) => ({
  targetSource: 'GOOGLE_MAPS',
  discoveryMethod: 'GOOGLE_PLACES',
  sourceType: 'GOOGLE_PLACES_RESULT',
  sourceUrl: lead.googleMapsUrl || lead.websiteUrl || null,
  externalId: lead.sourceId || null,
  title: lead.businessName,
  snippet: lead.category || lead.address || null,
  extractedFields: {
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    country: lead.country,
    address: lead.address,
    phone: lead.phone,
    websiteUrl: lead.websiteUrl,
    googleMapsUrl: lead.googleMapsUrl,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
  },
  rawMetadata: lead.rawData || {},
  confidenceScore: 82,
});

export const getDiscoveryReadinessForCampaign = (campaign = {}) => {
  const targeting = normalizeCampaignTargeting(campaign);
  const googleStatus = getSourceStatusByKey('GOOGLE_MAPS');
  const searchMetadataStatus = getSearchMetadataProviderStatus();
  return {
    localDataset: { configured: true, available: true, message: 'Local business index is available.' },
    searchMetadata: {
      configured: Boolean(searchMetadataStatus?.availableProviders?.length),
      available: Boolean(searchMetadataStatus?.runnable),
      provider: searchMetadataStatus?.primaryProvider?.toUpperCase?.() || 'SEARCH_METADATA',
      message: searchMetadataStatus?.status || null,
    },
    googlePlaces: {
      configured: Boolean(googleStatus?.runtimeAvailable),
      available: Boolean(googleStatus?.runtimeAvailable),
      message: googleStatus?.reason || null,
    },
    openWeb: {
      configured: Boolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
      available: Boolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
      message: env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED ? null : 'Open web evidence is not configured.',
    },
    targeting,
  };
};

export const runDiscoveryOrchestrator = async ({ campaign }) => {
  const readiness = getDiscoveryReadinessForCampaign(campaign);
  const targeting = readiness.targeting;
  const queryVariants = buildQueryVariants(campaign);
  const providerBreakdown = [];
  const accepted = new Map();
  const linkedEvidenceResults = [];
  const externalEvidenceResults = [];
  const layerSummary = [];
  const requestedLimit = Math.max(1, Number(campaign.requestedLimit) || 20);

  const cacheStartedAt = Date.now();
  const evidenceRecords = await findReusableEvidenceCandidates({
    campaign,
    targetSources: [...new Set([...targeting.rawSources, ...targeting.presenceTargets])],
    limit: requestedLimit,
  });
  const evidenceCandidates = convertEvidenceToReusableLeadCandidates({ evidences: evidenceRecords, campaign });
  const linkedEvidence = evidenceCandidates.filter((item) => item.catalogLeadId);
  const cacheRejections = createRejectionCounts();
  for (const item of linkedEvidence) {
    const normalized = normalizeCatalogCandidate({
      ...item,
      id: item.catalogLeadId,
      source: 'LEAD_EVIDENCE_CACHE',
    }, campaign);
    const quality = assessLeadCandidateQuality({
      candidate: normalized,
      campaign,
      sourceKind: 'catalog',
    });
    if (!quality.accepted) {
      registerRejection(cacheRejections, quality.code);
      continue;
    }
    item.opportunityScorePreview = normalized.score.finalScore;
    item.scoreBreakdownPreview = normalized.score;
    if (!accepted.has(normalized.dedupeKey)) {
      accepted.set(normalized.dedupeKey, normalized);
      linkedEvidenceResults.push(normalized);
    } else {
      registerRejection(cacheRejections, 'REJECTED_DUPLICATE');
    }
  }
  layerSummary.push(makeLayerResult({
    layerKey: DISCOVERY_LAYER_KEYS.CACHE_EVIDENCE,
    provider: 'LEAD_EVIDENCE_CACHE',
    status: linkedEvidenceResults.length ? DISCOVERY_LAYER_STATUS.COMPLETED : DISCOVERY_LAYER_STATUS.NO_RESULTS,
    configured: true,
    attempted: true,
    rawCount: evidenceCandidates.length,
    acceptedCount: linkedEvidenceResults.length,
    dedupedCount: linkedEvidence.length - linkedEvidenceResults.length,
    durationMs: Date.now() - cacheStartedAt,
    reason: linkedEvidenceResults.length ? null : 'No reusable evidence matched this search.',
    ...cacheRejections,
  }));
  providerBreakdown.push({ provider: 'LEAD_EVIDENCE_CACHE', count: linkedEvidenceResults.length });

  const localStartedAt = Date.now();
  const localAdapter = new LocalDatasetAdapter({
    ...campaign,
    requestedLimit,
    filters: {
      ...(campaign.filters || {}),
      platformsRequested: [...new Set([...targeting.rawSources, ...targeting.presenceTargets])],
    },
  });
  const localResults = await localAdapter.run();
  const acceptedLocal = [];
  const localRejections = createRejectionCounts();
  for (const lead of localResults) {
    const normalized = normalizeCatalogCandidate(lead, campaign);
    const quality = assessLeadCandidateQuality({
      candidate: normalized,
      campaign,
      sourceKind: 'catalog',
    });
    if (!quality.accepted) {
      registerRejection(localRejections, quality.code);
      continue;
    }
    lead.opportunityScorePreview = normalized.score.finalScore;
    lead.scoreBreakdownPreview = normalized.score;
    if (!accepted.has(normalized.dedupeKey)) {
      accepted.set(normalized.dedupeKey, normalized);
      acceptedLocal.push(normalized);
      if (accepted.size >= requestedLimit) break;
    } else {
      registerRejection(localRejections, 'REJECTED_DUPLICATE');
    }
  }
  layerSummary.push(makeLayerResult({
    layerKey: DISCOVERY_LAYER_KEYS.LOCAL_DATASET,
    provider: 'LOCAL_DATASET',
    status: acceptedLocal.length ? DISCOVERY_LAYER_STATUS.COMPLETED : DISCOVERY_LAYER_STATUS.NO_RESULTS,
    configured: true,
    attempted: true,
    queryVariantsUsed: queryVariants,
    rawCount: localResults.length,
    acceptedCount: acceptedLocal.length,
    dedupedCount: Math.max(0, localResults.length - acceptedLocal.length),
    durationMs: Date.now() - localStartedAt,
    reason: acceptedLocal.length ? null : 'No local business index matches were found.',
    ...localRejections,
  }));
  providerBreakdown.push({ provider: 'LOCAL_DATASET', count: acceptedLocal.length });

  const discoveryDecision = buildCacheFirstDecision({
    campaign,
    localResults,
    evidenceCandidates,
    providerReadiness: {
      searchMetadata: {
        runnable: readiness.searchMetadata.available,
        liveEnabled: readiness.searchMetadata.available,
      },
      googlePlaces: {
        runnable: readiness.googlePlaces.available,
        configured: readiness.googlePlaces.configured,
      },
    },
  });

  let searchMetadataCandidates = [];
  const searchMetadataRequested = targeting.presenceTargets.length > 0 || targeting.rawSources.includes('SERPAPI');
  if (searchMetadataRequested) {
    const startedAt = Date.now();
    if (!discoveryDecision.runPaidSearchMetadata) {
      layerSummary.push(makeLayerResult({
        layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
        provider: 'SEARCH_METADATA',
        status: DISCOVERY_LAYER_STATUS.SKIPPED,
        configured: readiness.searchMetadata.configured,
        attempted: false,
        queryVariantsUsed: queryVariants,
        reason: discoveryDecision.searchMetadataPlan?.reason || 'SEARCH_METADATA_SKIPPED',
      }));
      providerBreakdown.push({ provider: 'SEARCH_METADATA', count: 0 });
    } else if (!readiness.searchMetadata.available) {
      layerSummary.push(makeLayerResult({
        layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
        provider: 'SEARCH_METADATA',
        status: DISCOVERY_LAYER_STATUS.SKIPPED,
        configured: false,
        attempted: false,
        queryVariantsUsed: queryVariants,
        reason: 'Search Metadata is not configured.',
      }));
      providerBreakdown.push({ provider: 'SEARCH_METADATA', count: 0 });
    } else {
      try {
        const adapter = new SerpAdapter(campaign, {
          queryVariants: queryVariants.slice(0, discoveryDecision.searchMetadataPlan?.maxQueriesAllowed || queryVariants.length),
          targetSources: targeting.presenceTargets.length ? targeting.presenceTargets : ['SERPAPI'],
          missingResultCount: requestedLimit - accepted.size,
        });
        const results = await adapter.run();
        const acceptedExternal = [];
        const searchMetadataRejections = createRejectionCounts();
        for (const candidate of results) {
          const normalized = normalizeEvidenceCandidate(candidate, campaign, adapter.metadata?.providerUsed || 'SEARCH_METADATA');
          const quality = assessLeadCandidateQuality({
            candidate: {
              ...normalized,
              sourceUrl: candidate.sourceUrl,
              providerPlaceId: candidate.providerPlaceId,
            },
            campaign,
            sourceKind: 'external',
          });
          if (!quality.accepted) {
            registerRejection(searchMetadataRejections, quality.code);
            continue;
          }
          if (!accepted.has(normalized.dedupeKey)) {
            acceptedExternal.push(normalized);
            accepted.set(normalized.dedupeKey, normalized);
            externalEvidenceResults.push(normalized);
          } else {
            registerRejection(searchMetadataRejections, 'REJECTED_DUPLICATE');
          }
        }
        searchMetadataCandidates = acceptedExternal;
        layerSummary.push(makeLayerResult({
          layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
          provider: adapter.metadata?.providerUsed || 'SEARCH_METADATA',
          status: acceptedExternal.length ? DISCOVERY_LAYER_STATUS.COMPLETED : DISCOVERY_LAYER_STATUS.NO_RESULTS,
          configured: true,
          attempted: true,
          queryVariantsUsed: queryVariants,
          rawCount: results.length,
          acceptedCount: acceptedExternal.length,
          dedupedCount: Math.max(0, results.length - acceptedExternal.length),
          durationMs: Date.now() - startedAt,
          costUnits: results.length ? (adapter.metadata?.queriesUsed || 0) : 0,
          reason: acceptedExternal.length ? null : 'Search Metadata did not return usable business candidates.',
          warnings: adapter.metadata?.fallbackUsed ? ['SECONDARY_PROVIDER_USED'] : [],
          ...searchMetadataRejections,
        }));
        providerBreakdown.push({ provider: adapter.metadata?.providerUsed || 'SEARCH_METADATA', count: acceptedExternal.length });
      } catch (error) {
        layerSummary.push(makeLayerResult({
          layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
          provider: 'SEARCH_METADATA',
          status: DISCOVERY_LAYER_STATUS.FAILED,
          configured: true,
          attempted: true,
          queryVariantsUsed: queryVariants,
          durationMs: Date.now() - startedAt,
          reason: error.message,
        }));
        providerBreakdown.push({ provider: 'SEARCH_METADATA', count: 0 });
      }
    }
  }

  let googleCandidates = [];
  if (targeting.rawSources.includes('GOOGLE_MAPS')) {
    const startedAt = Date.now();
    if (!discoveryDecision.googlePlacesPlan?.shouldRun) {
      layerSummary.push(makeLayerResult({
        layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
        provider: 'GOOGLE_PLACES',
        status: DISCOVERY_LAYER_STATUS.SKIPPED,
        configured: readiness.googlePlaces.configured,
        attempted: false,
        queryVariantsUsed: queryVariants,
        reason: discoveryDecision.googlePlacesPlan?.reason || 'GOOGLE_PLACES_SKIPPED',
      }));
      providerBreakdown.push({ provider: 'GOOGLE_PLACES', count: 0 });
    } else if (!readiness.googlePlaces.available) {
      layerSummary.push(makeLayerResult({
        layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
        provider: 'GOOGLE_PLACES',
        status: DISCOVERY_LAYER_STATUS.SKIPPED,
        configured: false,
        attempted: false,
        queryVariantsUsed: queryVariants,
        reason: 'Google Places API key is not configured.',
      }));
      providerBreakdown.push({ provider: 'GOOGLE_PLACES', count: 0 });
    } else {
      try {
        const adapter = new GooglePlacesAdapter({
          ...campaign,
          requestedLimit: requestedLimit - accepted.size,
        }, {
          queryVariants,
        });
        const results = await adapter.run();
        const acceptedExternal = [];
        const googleRejections = createRejectionCounts();
        for (const lead of results) {
          const evidence = normalizeGoogleLeadToEvidence(lead);
          const normalized = normalizeEvidenceCandidate(evidence, campaign, 'GOOGLE_PLACES');
          const quality = assessLeadCandidateQuality({
            candidate: {
              ...normalized,
              sourceUrl: evidence.sourceUrl,
              providerPlaceId: evidence.externalId,
            },
            campaign,
            sourceKind: 'external',
          });
          if (!quality.accepted) {
            registerRejection(googleRejections, quality.code);
            continue;
          }
          if (!accepted.has(normalized.dedupeKey)) {
            acceptedExternal.push(normalized);
            accepted.set(normalized.dedupeKey, normalized);
            externalEvidenceResults.push(normalized);
          } else {
            registerRejection(googleRejections, 'REJECTED_DUPLICATE');
          }
        }
        googleCandidates = acceptedExternal;
        layerSummary.push(makeLayerResult({
          layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
          provider: 'GOOGLE_PLACES',
          status: acceptedExternal.length ? DISCOVERY_LAYER_STATUS.COMPLETED : DISCOVERY_LAYER_STATUS.NO_RESULTS,
          configured: true,
          attempted: true,
          queryVariantsUsed: queryVariants,
          rawCount: results.length,
          acceptedCount: acceptedExternal.length,
          dedupedCount: Math.max(0, results.length - acceptedExternal.length),
          durationMs: Date.now() - startedAt,
          costUnits: queryVariants.length,
          reason: acceptedExternal.length ? null : 'Google Places did not return usable business candidates.',
          ...googleRejections,
        }));
        providerBreakdown.push({ provider: 'GOOGLE_PLACES', count: acceptedExternal.length });
      } catch (error) {
        layerSummary.push(makeLayerResult({
          layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
          provider: 'GOOGLE_PLACES',
          status: DISCOVERY_LAYER_STATUS.FAILED,
          configured: true,
          attempted: true,
          queryVariantsUsed: queryVariants,
          durationMs: Date.now() - startedAt,
          reason: error.message,
        }));
        providerBreakdown.push({ provider: 'GOOGLE_PLACES', count: 0 });
      }
    }
  }

  let openWebEvidence = {
    openWebUsed: false,
    cacheHits: 0,
    linkedCandidates: [],
    promotableCandidates: [],
    results: [],
    skippedReason: null,
  };
  const websiteRequested = targeting.rawSources.includes('WEBSITE');
  if (accepted.size >= requestedLimit && websiteRequested) {
    layerSummary.push(makeLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.WEBSITE_OPEN_WEB,
      provider: 'OPEN_WEB_EVIDENCE',
      status: DISCOVERY_LAYER_STATUS.SKIPPED,
      configured: readiness.openWeb.available,
      attempted: false,
      reason: 'DIRECT_COVERAGE_SUFFICIENT',
    }));
    providerBreakdown.push({ provider: 'OPEN_WEB_EVIDENCE', count: 0 });
    openWebEvidence.skippedReason = 'DIRECT_COVERAGE_SUFFICIENT';
  } else if (accepted.size < requestedLimit) {
    const startedAt = Date.now();
    openWebEvidence = await collectOpenWebEvidenceCandidates({
      campaign,
      localResults,
      evidenceCandidates: [...evidenceCandidates, ...searchMetadataCandidates.map((item) => item.evidence).filter(Boolean)],
    });
    layerSummary.push(makeLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.WEBSITE_OPEN_WEB,
      provider: 'OPEN_WEB_EVIDENCE',
      status: openWebEvidence.openWebUsed
        ? (openWebEvidence.promotableCandidates.length || openWebEvidence.linkedCandidates.length
          ? DISCOVERY_LAYER_STATUS.COMPLETED
          : DISCOVERY_LAYER_STATUS.NO_RESULTS)
        : DISCOVERY_LAYER_STATUS.SKIPPED,
      configured: readiness.openWeb.available,
      attempted: Boolean(openWebEvidence.openWebUsed),
      rawCount: openWebEvidence.results.length,
      acceptedCount: openWebEvidence.promotableCandidates.length + openWebEvidence.linkedCandidates.length,
      durationMs: Date.now() - startedAt,
      reason: openWebEvidence.skippedReason
        ? 'Open web evidence did not have enough eligible seeds.'
        : (openWebEvidence.promotableCandidates.length || openWebEvidence.linkedCandidates.length ? null : 'Open web evidence did not add usable business candidates.'),
      warnings: openWebEvidence.cacheHits ? ['CACHE_HIT'] : [],
    }));
    providerBreakdown.push({ provider: 'OPEN_WEB_EVIDENCE', count: openWebEvidence.promotableCandidates.length + openWebEvidence.linkedCandidates.length });
  }

  layerSummary.push(makeLayerResult({
    layerKey: DISCOVERY_LAYER_KEYS.FUTURE_PROVIDER,
    provider: 'FUTURE_PROVIDER',
    status: DISCOVERY_LAYER_STATUS.SKIPPED,
    configured: false,
    attempted: false,
    reason: 'No future provider is configured.',
  }));

  const foundCount = accepted.size;
  const shortfallCount = Math.max(0, requestedLimit - foundCount);
  const shortfallReason = shortfallCount > 0
    ? `Only ${foundCount} of ${requestedLimit} leads were found across the configured discovery layers.`
    : null;
  const searchMetadataLayer = layerSummary.find((layer) => layer.layerKey === DISCOVERY_LAYER_KEYS.SEARCH_METADATA);
  const googlePlacesLayer = layerSummary.find((layer) => layer.layerKey === DISCOVERY_LAYER_KEYS.GOOGLE_PLACES);

  return {
    requestedLimit,
    foundCount,
    acceptedCount: foundCount,
    shortfallCount,
    shortfallReason,
    queryVariants,
    readiness,
    providerBreakdown,
    layerSummary,
    executionSummary: {
      searchMetadataProviderUsed: searchMetadataLayer?.attempted ? (searchMetadataLayer?.provider || null) : null,
      searchMetadataSecondaryProviderUsed: Boolean(searchMetadataLayer?.warnings?.includes('SECONDARY_PROVIDER_USED')),
      googlePlacesUsed: googlePlacesLayer?.status === DISCOVERY_LAYER_STATUS.COMPLETED,
    },
    discoveryDecision,
    localResults,
    evidenceCandidates,
    linkedEvidenceCandidatesRaw: linkedEvidence,
    externalEvidenceCandidatesRaw: externalEvidenceResults.map((item) => item.evidence).filter(Boolean),
    linkedEvidenceResults,
    externalEvidenceResults,
    googleCandidates,
    openWebEvidence,
  };
};
