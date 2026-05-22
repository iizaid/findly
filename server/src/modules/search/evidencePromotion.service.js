import crypto from 'node:crypto';
import { buildLeadFingerprint, normalizeBusinessName, normalizeInstagramUsername, normalizePhone, normalizeUrl } from './leadDeduplication.js';
import { recordValidationEvent } from './discoveryEvidence.service.js';

const PROMOTION_MIN_CONFIDENCE = 65;
const STRICT_PROMOTION_MIN_CONFIDENCE = 75;

const GENERIC_NAMES = new Set(['unknown business', 'business', 'home', 'profile', 'instagram', 'facebook', 'tiktok', 'reddit', 'yelp', 'tripadvisor']);

const validHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

const sourceIdFor = (sourceUrl) => crypto.createHash('sha256').update(sourceUrl || '').digest('hex').slice(0, 32);

const detectedSignalsFor = (evidence) => {
  const provider = (evidence.rawMetadata?.provider || evidence.extractedFields?.provider || 'SEARCH_METADATA').toString().toUpperCase();
  const signals = ['SOURCE_SEARCH_METADATA', `SOURCE_${provider}`, `HAS_${evidence.targetSource}`];
  if (evidence.extractedFields?.platformUrl) signals.push(`HAS_${evidence.targetSource}_URL`);
  return [...new Set(signals)];
};

const catalogDataFromEvidence = (evidence, campaign) => {
  const fields = evidence.extractedFields || {};
  const sourceUrl = validHttpUrl(evidence.sourceUrl);
  const sourceId = sourceIdFor(sourceUrl);
  const provider = (evidence.rawMetadata?.provider || evidence.extractedFields?.provider || 'SEARCH_METADATA').toString().toUpperCase();
  const data = {
    businessName: fields.businessName || evidence.title || 'Unknown Business',
    category: fields.category || (Array.isArray(campaign.businessTypes) ? campaign.businessTypes[0] || null : null),
    country: fields.country || campaign.country || null,
    city: fields.city || campaign.city || null,
    source: provider,
    sourceId,
    normalizedFingerprint: `${provider.toLowerCase()}:${sourceId}`,
    rawData: {
      evidenceId: evidence.id,
      targetSource: evidence.targetSource,
      provider,
      displayedLink: fields.displayedLink || null,
      resultPosition: fields.resultPosition || null,
    },
    detectedSignals: detectedSignalsFor(evidence),
    importedAt: new Date(),
  };

  if (evidence.targetSource === 'INSTAGRAM') {
    data.instagramUrl = sourceUrl;
    data.instagramUsername = fields.platformUsername || null;
  } else if (evidence.targetSource === 'FACEBOOK') {
    data.facebookUrl = sourceUrl;
  } else if (evidence.targetSource === 'GOOGLE_MAPS') {
    data.googleMapsUrl = sourceUrl;
  } else {
    data.websiteUrl = sourceUrl;
  }

  return data;
};

const isGenericBusinessName = (value) => {
  const normalized = normalizeBusinessName(value);
  return !normalized || normalized.length < 3 || GENERIC_NAMES.has(normalized);
};

const targetMatchesUrl = (evidence) => {
  if (!evidence?.sourceUrl || evidence.targetSource === 'WEBSITE') return true;
  const hostname = (() => {
    try {
      return new URL(evidence.sourceUrl).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  })();
  const expected = {
    INSTAGRAM: 'instagram.com',
    TIKTOK: 'tiktok.com',
    FACEBOOK: 'facebook.com',
    REDDIT: 'reddit.com',
    YELP: 'yelp.com',
    TRIPADVISOR: 'tripadvisor.com',
    LINKEDIN: 'linkedin.com',
    YOUTUBE: 'youtube.com',
    X: 'x.com',
  }[evidence.targetSource];
  return !expected || hostname === expected || hostname.endsWith(`.${expected}`);
};

const needsStrictThreshold = (evidence) => {
  if (!evidence) return false;
  const reasons = evidence.rawMetadata?.confidenceReasons || evidence.extractedFields?.confidenceReasons || [];
  const hasLocation = reasons.includes('CITY_MATCH') || reasons.includes('COUNTRY_MATCH');
  const hasCategory = reasons.includes('CATEGORY_MATCH');
  return !hasLocation || !hasCategory;
};

const findDuplicateCatalogLead = async ({ tx, lead }) => {
  const fingerprint = buildLeadFingerprint(lead);
  const exactOr = [];
  const fuzzyOr = [];

  if (lead.source && lead.sourceId) exactOr.push({ source: lead.source, sourceId: lead.sourceId });
  if (lead.normalizedFingerprint) exactOr.push({ normalizedFingerprint: lead.normalizedFingerprint });
  if (lead.instagramUsername) exactOr.push({ instagramUsername: { equals: lead.instagramUsername, mode: 'insensitive' } });
  if (lead.websiteUrl) {
    const websiteKey = normalizeUrl(lead.websiteUrl);
    if (websiteKey) fuzzyOr.push({ websiteUrl: { contains: websiteKey.split('/')[0], mode: 'insensitive' } });
  }
  const phoneKey = normalizePhone(lead.phone);
  if (phoneKey) exactOr.push({ phone: { contains: phoneKey.slice(-7) } });
  const instagramKey = normalizeInstagramUsername(lead.instagramUsername);
  if (instagramKey) exactOr.push({ instagramUsername: { equals: instagramKey, mode: 'insensitive' } });
  const normalizedName = normalizeBusinessName(lead.businessName);
  if (normalizedName && lead.city) {
    fuzzyOr.push({
      businessName: { contains: normalizedName.split(' ')[0], mode: 'insensitive' },
      city: { equals: lead.city, mode: 'insensitive' },
    });
  }

  const matchesFingerprint = (candidate) => {
    const candidateFingerprint = buildLeadFingerprint(candidate);
    return Boolean(
      (fingerprint.sourceKey && fingerprint.sourceKey === candidateFingerprint.sourceKey)
      || (fingerprint.datasetKey && fingerprint.datasetKey === candidateFingerprint.datasetKey)
      || (fingerprint.instagramKey && fingerprint.instagramKey === candidateFingerprint.instagramKey)
      || (fingerprint.websiteKey && fingerprint.websiteKey === candidateFingerprint.websiteKey)
      || (fingerprint.phoneKey && fingerprint.phoneKey === candidateFingerprint.phoneKey)
      || (fingerprint.nameCityKey && fingerprint.nameCityKey === candidateFingerprint.nameCityKey)
      || (fingerprint.addressKey && fingerprint.addressKey === candidateFingerprint.addressKey)
    );
  };

  if (exactOr.length > 0) {
    const exactCandidates = await tx.leadCatalog.findMany({ where: { OR: exactOr }, take: 20 });
    const exactMatch = exactCandidates.find(matchesFingerprint);
    if (exactMatch) return exactMatch;
  }

  if (fuzzyOr.length === 0) return null;
  const fuzzyCandidates = await tx.leadCatalog.findMany({ where: { OR: fuzzyOr }, take: 50 });
  return fuzzyCandidates.find(matchesFingerprint) || null;
};

const recordPromotionEvent = ({ tx, evidence, campaign, result, catalogLeadId = null, rationale }) => recordValidationEvent({
  tx,
  userId: evidence.userId,
  workspaceId: evidence.workspaceId,
  campaignId: campaign.id,
  catalogLeadId,
  evidenceId: evidence.id,
  validator: 'EVIDENCE_PROMOTION',
  result,
  rationale,
  metadata: {
    confidenceScore: evidence.confidenceScore,
    targetSource: evidence.targetSource,
  },
});

export const promoteEvidenceToCatalogLead = async ({ tx, evidence, campaign }) => {
  const threshold = needsStrictThreshold(evidence) ? STRICT_PROMOTION_MIN_CONFIDENCE : PROMOTION_MIN_CONFIDENCE;
  if (!evidence || evidence.confidenceScore < threshold) {
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'REJECTED_LOW_CONFIDENCE',
      rationale: `Evidence confidence is below promotion threshold (${threshold}).`,
    });
    return { status: 'REJECTED_LOW_CONFIDENCE', catalogLead: null };
  }

  const sourceUrl = validHttpUrl(evidence.sourceUrl);
  if (!sourceUrl) {
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'REJECTED_MALFORMED_URL',
      rationale: 'Evidence source URL is not a safe HTTP URL.',
    });
    return { status: 'REJECTED_MALFORMED_URL', catalogLead: null };
  }

  const catalogData = catalogDataFromEvidence(evidence, campaign);
  if (isGenericBusinessName(catalogData.businessName)) {
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'REJECTED_GENERIC_NAME',
      rationale: 'Evidence did not include a usable business name.',
    });
    return { status: 'REJECTED_GENERIC_NAME', catalogLead: null };
  }

  if (!targetMatchesUrl(evidence)) {
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'REJECTED_TARGET_MISMATCH',
      rationale: 'Evidence URL platform does not match the requested target source.',
    });
    return { status: 'REJECTED_TARGET_MISMATCH', catalogLead: null };
  }

  const duplicate = await findDuplicateCatalogLead({ tx, lead: catalogData });
  if (duplicate) {
    await tx.leadEvidence.update({ where: { id: evidence.id }, data: { catalogLeadId: duplicate.id } });
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'LINKED_DUPLICATE',
      catalogLeadId: duplicate.id,
      rationale: 'Evidence matched an existing catalog lead.',
    });
    return { status: 'LINKED_DUPLICATE', catalogLead: duplicate };
  }

  const created = await tx.leadCatalog.create({ data: catalogData });
  await tx.leadEvidence.update({ where: { id: evidence.id }, data: { catalogLeadId: created.id } });
  await recordPromotionEvent({
    tx,
    evidence,
    campaign,
    result: 'PROMOTED',
    catalogLeadId: created.id,
    rationale: 'High-confidence evidence promoted to LeadCatalog.',
  });
  return { status: 'PROMOTED', catalogLead: created };
};

export const promoteHighConfidenceEvidenceBatch = async ({ tx, evidences = [], campaign, limit = 20 }) => {
  const results = [];
  for (const evidence of evidences.slice(0, limit)) {
    results.push(await promoteEvidenceToCatalogLead({ tx, evidence, campaign }));
  }
  return results;
};
