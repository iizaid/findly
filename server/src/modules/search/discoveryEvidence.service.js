import crypto from 'crypto';
import { redactSensitive } from '../ai/aiSecurity.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const SOCIAL_TARGETS = new Set(['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'REDDIT']);

const addDays = (days) => new Date(Date.now() + days * DAY_MS);
const clampScore = (score) => Math.max(0, Math.min(100, Number.isFinite(Number(score)) ? Math.round(Number(score)) : 0));

export const hashSnippet = (snippet) => {
  if (!snippet) return null;
  return crypto.createHash('sha256').update(snippet.toString()).digest('hex');
};

const truncateString = (value) => (value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value);

const trimPayload = (value, depth = 0) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => trimPayload(item, depth + 1));
  if (typeof value === 'object') {
    if (depth >= 3) return '[truncated]';
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([key, item]) => [key, trimPayload(item, depth + 1)])
    );
  }
  return null;
};

export const sanitizeEvidenceMetadata = (rawMetadata) => {
  if (!rawMetadata) return null;
  return trimPayload(redactSensitive(rawMetadata));
};

export const calculateDefaultStoreUntil = (sourceType, discoveryMethod, targetSource) => {
  const method = (discoveryMethod || '').toString().toUpperCase();
  const type = (sourceType || '').toString().toUpperCase();
  const target = (targetSource || '').toString().toUpperCase();

  if (method === 'LOCAL_DATASET' || method === 'CSV_IMPORT') return null;
  if (method === 'OPEN_WEB_EVIDENCE' || type.includes('OPEN_WEB')) return addDays(90);
  if (method === 'WEBSITE_METADATA' || type.includes('WEBSITE')) return addDays(90);
  if (method === 'GOOGLE_PLACES' || type.includes('GOOGLE_PLACE')) return addDays(365);
  if (method === 'SERPAPI_DISCOVERY' || SOCIAL_TARGETS.has(target) || type.includes('SERP')) return addDays(30);
  return addDays(30);
};

export const createDiscoveryQuery = async ({
  tx,
  userId,
  workspaceId,
  campaignId = null,
  seedQuery = null,
  expandedQuery,
  locale = null,
  geography = null,
  targetSources = [],
  discoveryMethod,
  adapter,
  costUnits = 0,
  status = 'CREATED',
}) => {
  const client = tx;
  return client.discoveryQuery.create({
    data: {
      userId,
      workspaceId,
      campaignId,
      seedQuery,
      expandedQuery: expandedQuery || seedQuery || 'Findly discovery query',
      locale,
      geography,
      targetSources,
      discoveryMethod,
      adapter,
      costUnits,
      status,
      executedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });
};

export const recordLeadEvidence = async ({
  tx,
  userId,
  workspaceId,
  campaignId = null,
  discoveryQueryId = null,
  leadId = null,
  catalogLeadId = null,
  targetSource,
  discoveryMethod,
  sourceType,
  sourceUrl = null,
  externalId = null,
  title = null,
  snippet = null,
  extractedFields = null,
  rawMetadata = null,
  confidenceScore = 0,
  attributionRequired = false,
  robotsStatus = null,
  storeUntil = undefined,
}) => {
  const client = tx;
  return client.leadEvidence.create({
    data: {
      userId,
      workspaceId,
      campaignId,
      discoveryQueryId,
      leadId,
      catalogLeadId,
      targetSource,
      discoveryMethod,
      sourceType,
      sourceUrl,
      externalId,
      title,
      snippetHash: hashSnippet(snippet),
      extractedFields: sanitizeEvidenceMetadata(extractedFields),
      rawMetadata: sanitizeEvidenceMetadata(rawMetadata),
      confidenceScore: clampScore(confidenceScore),
      attributionRequired,
      robotsStatus,
      storeUntil: storeUntil === undefined
        ? calculateDefaultStoreUntil(sourceType, discoveryMethod, targetSource)
        : storeUntil,
    },
  });
};

export const linkEvidenceToLead = async ({ tx, evidenceId, leadId }) => tx.leadEvidence.update({
  where: { id: evidenceId },
  data: { leadId },
});

export const linkEvidenceToCatalogLead = async ({ tx, evidenceId, catalogLeadId }) => tx.leadEvidence.update({
  where: { id: evidenceId },
  data: { catalogLeadId },
});

export const recordValidationEvent = async ({ tx, metadata = null, ...data }) => tx.validationEvent.create({
  data: {
    ...data,
    metadata: sanitizeEvidenceMetadata(metadata),
  },
});

export const recordEnrichmentRun = async ({ tx, requestedFields = null, returnedFields = null, ...data }) => tx.enrichmentRun.create({
  data: {
    ...data,
    requestedFields: sanitizeEvidenceMetadata(requestedFields),
    returnedFields: sanitizeEvidenceMetadata(returnedFields),
  },
});
