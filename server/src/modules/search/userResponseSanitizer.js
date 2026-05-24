const sourceLabelsForUsers = {
  LOCAL_DATASET: 'Online Source',
  DATASET_IMPORT: 'Online Source',
  MANUAL_ADMIN: 'Online Source',
  CSV: 'Online Source',
  INSTAGRAM_DATASET: 'Instagram',
  GOOGLE_MAPS_DATASET: 'Google Maps',
  GOOGLE_MAPS: 'Google Maps',
  WEBSITE: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  YELP: 'Yelp',
  TRIPADVISOR: 'TripAdvisor',
  YOUTUBE: 'YouTube',
  X: 'X',
  SERPAPI: 'Online Search',
  REDDIT: 'Online Source',
};

const internalSignals = new Set([
  'DATASET_IMPORTED',
  'SOURCE_LOCAL_DATASET',
  'SOURCE_DATASET_IMPORT',
  'SOURCE_MANUAL_ADMIN',
  'MANUAL_ADMIN_ENTRY',
]);

export const mapSourceForUserResponse = (source) => sourceLabelsForUsers[source] || source || null;

export const sanitizeDetectedSignalsForUserResponse = (signals) => {
  if (!Array.isArray(signals)) return signals;
  return signals.filter((signal) => !internalSignals.has(signal) && !signal?.includes?.('LOCAL'));
};

const sanitizeUserText = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\blocal\b/gi, 'nearby');
};

const inferAnalysisSource = (analysis = {}) => {
  const signals = Array.isArray(analysis.detectedSignals) ? analysis.detectedSignals : [];
  const sourceSignal = signals.find((signal) => typeof signal === 'string' && signal.startsWith('ANALYSIS_SOURCE_'));
  return sourceSignal?.replace('ANALYSIS_SOURCE_', '') || 'RULE_BASED';
};

const inferDataQualityLevel = (analysis = {}, scoreDimensions = []) => {
  const signals = Array.isArray(analysis.detectedSignals) ? analysis.detectedSignals : [];
  const signalLevel = signals.find((signal) => typeof signal === 'string' && signal.startsWith('DATA_QUALITY_'));
  if (signalLevel) return signalLevel.replace('DATA_QUALITY_', '');
  const dimension = scoreDimensions.find((item) => item.label?.toLowerCase?.() === 'data quality');
  if (!dimension) return null;
  if (dimension.value >= 75) return 'HIGH';
  if (dimension.value >= 45) return 'MEDIUM';
  return 'LOW';
};

const extractScoreDimensions = (reasons = []) => reasons
  .filter((reason) => typeof reason === 'string' && reason.includes('/100 - '))
  .map((reason) => {
    const [left, detail] = reason.split('/100 - ');
    const [label, rawValue] = left.split(':');
    return {
      label: label?.trim() || 'Dimension',
      value: Number((rawValue || '').replace(/[^\d.-]/g, '')) || 0,
      reason: detail?.trim() || '',
    };
  });

const sanitizeAnalysisForUserResponse = (analysis) => {
  if (!analysis) return analysis;
  const reasons = Array.isArray(analysis.reasons) ? analysis.reasons.map(sanitizeUserText) : analysis.reasons;
  const scoreDimensions = extractScoreDimensions(reasons);
  return {
    ...analysis,
    analysisSource: inferAnalysisSource(analysis),
    detectedSignals: sanitizeDetectedSignalsForUserResponse(analysis.detectedSignals),
    reasons,
    scoreDimensions,
    dataQualityLevel: inferDataQualityLevel(analysis, scoreDimensions),
    aiFailureReason: sanitizeUserText(analysis.aiFailureReason),
    outreachAngle: sanitizeUserText(analysis.outreachAngle),
    messageDraft: sanitizeUserText(analysis.messageDraft),
  };
};

const sanitizeAnalysesForUserResponse = (analyses) => {
  if (!Array.isArray(analyses)) return analyses;
  return analyses.map(sanitizeAnalysisForUserResponse);
};

export const sanitizeLeadForUserResponse = (lead) => {
  if (!lead) return lead;
  const {
    sourceFile: _sourceFile,
    rawData: _rawData,
    normalizedFingerprint: _normalizedFingerprint,
    sourceId: _sourceId,
    datasetImportId: _datasetImportId,
    ...safeLead
  } = lead;

  return {
    ...safeLead,
    source: mapSourceForUserResponse(lead.source),
    detectedSignals: sanitizeDetectedSignalsForUserResponse(lead.detectedSignals),
    analyses: sanitizeAnalysesForUserResponse(safeLead.analyses),
  };
};

export const mapCatalogLeadForUserResponse = (catalogLead, item = {}) => {
  const safeLead = sanitizeLeadForUserResponse(catalogLead);
  return {
    ...safeLead,
    id: catalogLead.id,
    catalogLeadId: catalogLead.id,
    leadListItemId: item.id,
    catalogOnly: true,
    status: item.status || 'NEW',
    notes: item.notes || null,
    createdAt: item.createdAt || catalogLead.createdAt,
    updatedAt: item.updatedAt || catalogLead.updatedAt,
    analyses: sanitizeAnalysesForUserResponse(item.analyses || safeLead.analyses || []),
    listRank: item.rank,
    matchScore: item.score,
  };
};

export const sanitizeLeadListItemForUserResponse = (item) => {
  if (!item) return item;
  return {
    id: item.id,
    leadListId: item.leadListId,
    leadId: item.leadId,
    catalogLeadId: item.catalogLeadId,
    status: item.status,
    notes: item.notes,
    matchScore: item.score,
    analysisStatus: item.analysisStatus,
    analyzedAt: item.analyzedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const sanitizeLeadListForUserResponse = (list) => {
  if (!list) return list;
  const analysis = list.filters?.analysis && typeof list.filters.analysis === 'object'
    ? list.filters.analysis
    : null;
  const {
    sourceRequested: _sourceRequested,
    sourceUsed: _sourceUsed,
    fallbackUsed: _fallbackUsed,
    searchMode: _searchMode,
    filters: _filters,
    _count,
    ...safeList
  } = list;

  return {
    ...safeList,
    leadCount: _count?.leadItems || _count?.leads || 0,
    analysisStatus: analysis?.status || null,
    analysisJobId: analysis?.jobId || null,
    analysisSummary: analysis?.summary || null,
    analysisProgressCurrent: analysis?.progressCurrent ?? 0,
    analysisProgressTotal: analysis?.progressTotal ?? 0,
    analysisUpdatedAt: analysis?.updatedAt || null,
  };
};

const publicSourceKeys = new Set([
  'GOOGLE_MAPS',
  'REDDIT',
  'WEBSITE',
  'SERPAPI',
  'INSTAGRAM',
  'FACEBOOK',
  'LINKEDIN',
  'TIKTOK',
  'YELP',
  'TRIPADVISOR',
  'YOUTUBE',
  'X',
]);

export const sanitizeCampaignForUserResponse = (campaign) => {
  if (!campaign) return campaign;
  const presenceTargets = Array.isArray(campaign.filters?.presenceTargets)
    ? campaign.filters.presenceTargets.filter((target) => publicSourceKeys.has(target))
    : [];
  const { filters: _filters, ...safeCampaign } = campaign;
  return {
    ...safeCampaign,
    sources: Array.isArray(campaign.sources)
      ? campaign.sources.map((source) => (publicSourceKeys.has(source) ? source : 'ONLINE_SOURCE'))
      : campaign.sources,
    presenceTargets,
  };
};
