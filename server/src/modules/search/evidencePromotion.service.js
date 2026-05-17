import crypto from 'node:crypto';
import { buildLeadFingerprint, normalizeBusinessName, normalizeInstagramUsername, normalizePhone, normalizeUrl } from './leadDeduplication.js';
import { recordValidationEvent } from './discoveryEvidence.service.js';

const PROMOTION_MIN_CONFIDENCE = 65;

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
  const signals = ['SOURCE_SERPAPI', `HAS_${evidence.targetSource}`];
  if (evidence.extractedFields?.platformUrl) signals.push(`HAS_${evidence.targetSource}_URL`);
  return [...new Set(signals)];
};

const catalogDataFromEvidence = (evidence, campaign) => {
  const fields = evidence.extractedFields || {};
  const sourceUrl = validHttpUrl(evidence.sourceUrl);
  const sourceId = sourceIdFor(sourceUrl);
  const data = {
    businessName: fields.businessName || evidence.title || 'Unknown Business',
    category: fields.category || (Array.isArray(campaign.businessTypes) ? campaign.businessTypes[0] || null : null),
    country: fields.country || campaign.country || null,
    city: fields.city || campaign.city || null,
    source: 'SERPAPI',
    sourceId,
    normalizedFingerprint: `serpapi:${sourceId}`,
    rawData: {
      evidenceId: evidence.id,
      targetSource: evidence.targetSource,
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
  } else if (evidence.targetSource === 'WEBSITE') {
    data.websiteUrl = sourceUrl;
  } else {
    data.websiteUrl = sourceUrl;
  }

  return data;
};

const findDuplicateCatalogLead = async ({ tx, lead }) => {
  const fingerprint = buildLeadFingerprint(lead);
  const or = [];

  if (lead.source && lead.sourceId) or.push({ source: lead.source, sourceId: lead.sourceId });
  if (lead.normalizedFingerprint) or.push({ normalizedFingerprint: lead.normalizedFingerprint });
  if (lead.instagramUsername) or.push({ instagramUsername: { equals: lead.instagramUsername, mode: 'insensitive' } });
  if (lead.websiteUrl) {
    const websiteKey = normalizeUrl(lead.websiteUrl);
    if (websiteKey) or.push({ websiteUrl: { contains: websiteKey.split('/')[0], mode: 'insensitive' } });
  }
  const phoneKey = normalizePhone(lead.phone);
  if (phoneKey) or.push({ phone: { contains: phoneKey.slice(-7) } });
  const instagramKey = normalizeInstagramUsername(lead.instagramUsername);
  if (instagramKey) or.push({ instagramUsername: { equals: instagramKey, mode: 'insensitive' } });
  const normalizedName = normalizeBusinessName(lead.businessName);
  if (normalizedName && lead.city) {
    or.push({
      businessName: { contains: normalizedName.split(' ')[0], mode: 'insensitive' },
      city: { equals: lead.city, mode: 'insensitive' },
    });
  }

  if (or.length === 0) return null;
  const candidates = await tx.leadCatalog.findMany({ where: { OR: or }, take: 20 });
  return candidates.find((candidate) => {
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
  }) || null;
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
  if (!evidence || evidence.confidenceScore < PROMOTION_MIN_CONFIDENCE) {
    await recordPromotionEvent({
      tx,
      evidence,
      campaign,
      result: 'REJECTED_LOW_CONFIDENCE',
      rationale: 'Evidence confidence is below promotion threshold.',
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
