import { prisma } from '../../db/prisma.js';

const DEFAULT_MIN_CONFIDENCE = 65;

export const findReusableEvidenceCandidates = async ({ campaign, targetSources = [], limit = 20 }) => {
  const andConditions = [];

  // storeUntil null OR future
  andConditions.push({
    OR: [
      { storeUntil: null },
      { storeUntil: { gt: new Date() } }
    ]
  });

  if (campaign.city) {
    andConditions.push({ extractedFields: { path: ['city'], equals: campaign.city } });
  }
  if (campaign.country) {
    andConditions.push({ extractedFields: { path: ['country'], equals: campaign.country } });
  }
  if (campaign.businessTypes && campaign.businessTypes.length > 0) {
    andConditions.push({ extractedFields: { path: ['category'], equals: campaign.businessTypes[0] } });
  }

  andConditions.push({ confidenceScore: { gte: DEFAULT_MIN_CONFIDENCE } });

  if (targetSources.length > 0) {
    andConditions.push({ targetSource: { in: targetSources } });
  }

  // Find evidence that matches target sources or is just generally high confidence in this city/country
  const evidenceRecords = await prisma.leadEvidence.findMany({
    where: { AND: andConditions },
    take: limit * 2, // Grab more so we can filter
    orderBy: { confidenceScore: 'desc' },
  });

  // Filter out any without valid URLs or business names
  return evidenceRecords.filter(e => e.sourceUrl && e.title && e.title.length >= 3).slice(0, limit);
};

export const convertEvidenceToReusableLeadCandidates = ({ evidences = [], campaign }) => {
  return evidences.map(evidence => {
    // If it's linked to a catalog lead, that's ideal. We can just return it.
    // Since we don't have the catalog lead joined, we will mock the structure expected by the merge layer.
    return {
      id: evidence.catalogLeadId || `evidence_${evidence.id}`,
      businessName: evidence.title,
      category: evidence.extractedFields?.category || campaign.businessTypes?.[0] || 'Business',
      city: evidence.extractedFields?.city || campaign.city,
      country: evidence.extractedFields?.country || campaign.country,
      source: evidence.targetSource || 'LEAD_EVIDENCE_CACHE',
      sourceId: evidence.externalId || evidence.id,
      websiteUrl: evidence.targetSource === 'WEBSITE' ? evidence.sourceUrl : evidence.extractedFields?.websiteUrl,
      instagramUrl: evidence.targetSource === 'INSTAGRAM' ? evidence.sourceUrl : evidence.extractedFields?.instagramUrl,
      instagramUsername: evidence.extractedFields?.instagramUsername,
      facebookUrl: evidence.targetSource === 'FACEBOOK' ? evidence.sourceUrl : evidence.extractedFields?.facebookUrl,
      googleMapsUrl: evidence.targetSource === 'GOOGLE_MAPS' ? evidence.sourceUrl : evidence.extractedFields?.googleMapsUrl,
      phone: evidence.extractedFields?.phone,
      email: evidence.extractedFields?.email,
      rating: evidence.extractedFields?.rating,
      reviewCount: evidence.extractedFields?.reviewCount,
      localDatasetScore: evidence.confidenceScore,
      isReusableEvidence: true,
      originalEvidenceId: evidence.id,
      catalogLeadId: evidence.catalogLeadId,
    };
  });
};

export const evaluateEvidenceReuseCoverage = ({ campaign, localResults = [], evidenceCandidates = [] }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const totalCount = localResults.length + evidenceCandidates.length;
  const coverageRatio = Math.min(1, totalCount / requestedLimit);
  
  return {
    evidenceCount: evidenceCandidates.length,
    reusableCatalogLeadCount: evidenceCandidates.filter(e => e.catalogLeadId).length,
    highConfidenceUnlinkedCount: evidenceCandidates.filter(e => !e.catalogLeadId).length,
    coverageRatio,
    enoughEvidence: totalCount >= requestedLimit,
    savedExternalCallsEstimate: evidenceCandidates.length,
  };
};

export const shouldSkipPaidProvidersDueToEvidenceCache = ({ campaign, localResults = [], evidenceCandidates = [] }) => {
  const coverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates });
  return coverage.enoughEvidence;
};

export const explainEvidenceCacheDecision = ({ campaign, localResults = [], evidenceCandidates = [] }) => {
  const coverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates });
  if (coverage.evidenceCount === 0) return 'NO_REUSABLE_EVIDENCE';
  if (coverage.enoughEvidence) return 'EVIDENCE_COVERAGE_SUFFICIENT';
  return 'EVIDENCE_PARTIAL_COVERAGE';
};
