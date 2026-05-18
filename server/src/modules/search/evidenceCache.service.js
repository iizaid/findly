import { prisma } from '../../db/prisma.js';

const DEFAULT_MIN_CONFIDENCE = 65;

export const normalizeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const isSafeEvidenceUrl = (url) => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const matchesOptionalField = (expected, actual) => {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);
  if (!normalizedExpected || !normalizedActual) return true;
  return normalizedExpected === normalizedActual;
};

export const matchesBusinessType = (expectedBusinessTypes = [], actualCategory) => {
  const normalizedActual = normalizeText(actualCategory);
  if (!normalizedActual) return true;
  const expected = Array.isArray(expectedBusinessTypes) ? expectedBusinessTypes : [expectedBusinessTypes];
  const normalizedExpected = expected.map(normalizeText).filter(Boolean);
  if (normalizedExpected.length === 0) return true;
  return normalizedExpected.some((item) => item === normalizedActual
    || item.includes(normalizedActual)
    || normalizedActual.includes(item));
};

const evidenceDisplayName = (evidence) => evidence?.extractedFields?.businessName || evidence?.title || '';

export const scoreEvidenceReuseMatch = ({ evidence, campaign }) => {
  let score = 0;
  const fields = evidence.extractedFields || {};
  if (evidence.catalogLeadId) score += 50;
  score += Math.min(40, Math.floor((Number(evidence.confidenceScore) || 0) / 3));
  if (matchesOptionalField(campaign?.city, fields.city) && campaign?.city && fields.city) score += 20;
  if (matchesOptionalField(campaign?.country, fields.country) && campaign?.country && fields.country) score += 15;
  if (matchesBusinessType(campaign?.businessTypes || [], fields.category) && fields.category) score += 10;
  return score;
};

const isReusableEvidenceRecord = ({ evidence, campaign, targetSources }) => {
  const fields = evidence.extractedFields || {};
  const name = evidenceDisplayName(evidence);
  if ((Number(evidence.confidenceScore) || 0) < DEFAULT_MIN_CONFIDENCE) return false;
  if (targetSources.length > 0 && !targetSources.includes(evidence.targetSource)) return false;
  if (evidence.storeUntil && evidence.storeUntil <= new Date()) return false;
  if (!isSafeEvidenceUrl(evidence.sourceUrl)) return false;
  if (normalizeText(name).length < 3) return false;
  if (!matchesOptionalField(campaign?.city, fields.city)) return false;
  if (!matchesOptionalField(campaign?.country, fields.country)) return false;
  if (!matchesBusinessType(campaign?.businessTypes || [], fields.category)) return false;
  return true;
};

export const findReusableEvidenceCandidates = async ({ campaign, targetSources = [], limit = 20 }) => {
  const andConditions = [];

  andConditions.push({
    OR: [
      { storeUntil: null },
      { storeUntil: { gt: new Date() } }
    ]
  });

  andConditions.push({ confidenceScore: { gte: DEFAULT_MIN_CONFIDENCE } });

  if (targetSources.length > 0) {
    andConditions.push({ targetSource: { in: targetSources } });
  }

  const evidenceRecords = await prisma.leadEvidence.findMany({
    where: { AND: andConditions },
    take: Math.max(limit * 4, 50),
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
  });

  return evidenceRecords
    .filter((evidence) => isReusableEvidenceRecord({ evidence, campaign, targetSources }))
    .map((evidence) => ({
      ...evidence,
      reuseMatchScore: scoreEvidenceReuseMatch({ evidence, campaign }),
    }))
    .sort((a, b) => {
      if (Boolean(a.catalogLeadId) !== Boolean(b.catalogLeadId)) return a.catalogLeadId ? -1 : 1;
      if ((b.confidenceScore || 0) !== (a.confidenceScore || 0)) return (b.confidenceScore || 0) - (a.confidenceScore || 0);
      if ((b.reuseMatchScore || 0) !== (a.reuseMatchScore || 0)) return (b.reuseMatchScore || 0) - (a.reuseMatchScore || 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })
    .slice(0, limit);
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
  const linkedEvidence = evidenceCandidates.filter(e => e.catalogLeadId);
  const unlinkedEvidence = evidenceCandidates.filter(e => !e.catalogLeadId);
  const totalCount = localResults.length + linkedEvidence.length;
  const coverageRatio = Math.min(1, totalCount / requestedLimit);
  
  return {
    evidenceCount: evidenceCandidates.length,
    linkedEvidenceCount: linkedEvidence.length,
    unlinkedEvidenceCount: unlinkedEvidence.length,
    reusableCatalogLeadCount: linkedEvidence.length,
    highConfidenceUnlinkedCount: unlinkedEvidence.filter(e => (Number(e.confidenceScore) || 0) >= DEFAULT_MIN_CONFIDENCE).length,
    reusableForLeadListCount: linkedEvidence.length,
    coverageRatio,
    enoughEvidence: totalCount >= requestedLimit,
    savedExternalCallsEstimate: linkedEvidence.length,
    skippedReasons: unlinkedEvidence.length > 0 ? ['UNLINKED_EVIDENCE_NOT_DIRECTLY_REUSABLE'] : [],
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
