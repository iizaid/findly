import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/AppError.js';
import { sanitizeEvidenceMetadata } from './discoveryEvidence.service.js';
import {
  extractWebsiteMetadata,
  generateWebsiteOpportunitySignals,
  normalizeWebsiteUrl,
} from './websiteMetadata.service.js';
import {
  fetchArchivedHtmlFromRecord,
  queryCommonCrawlIndex,
} from './providers/commonCrawlProvider.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const GENERIC_BUSINESS_NAMES = new Set(['home', 'homepage', 'welcome', 'website', 'unknown business']);

const elapsedMs = (startedAtMs) => Math.max(0, Date.now() - startedAtMs);

const signal = (key, label, severity = 'INFO', confidenceContribution = 0, description = null) => ({
  key,
  label,
  severity,
  confidenceContribution,
  description,
});

const domainForUrl = (urlString) => {
  const parsed = new URL(urlString);
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
};

const cacheExpiry = () => new Date(Date.now() + env.OPEN_WEB_EVIDENCE_CACHE_TTL_DAYS * DAY_MS);

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildEvidenceHash = ({ normalizedUrl, latestCaptureAt, recordDigest, confidenceScore }) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    normalizedUrl,
    latestCaptureAt: latestCaptureAt?.toISOString?.() || null,
    recordDigest: recordDigest || null,
    confidenceScore,
  }))
  .digest('hex');

const dedupeSignals = (signals = []) => {
  const seen = new Set();
  return signals.filter((item) => {
    if (!item?.key || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const buildOpenWebSignals = ({ recordCount, latestCaptureAt, archivedMetadata = null, archivedHtmlFetched = false }) => {
  const signals = [];
  if (recordCount <= 0) {
    signals.push(signal(
      'ARCHIVED_EVIDENCE_INSUFFICIENT',
      'Archived evidence insufficient',
      'WARNING',
      -20,
      'Archived public web evidence did not provide enough confidence.',
    ));
    return signals;
  }

  signals.push(signal(
    'OPEN_WEB_EVIDENCE_FOUND',
    'Public web evidence found',
    'POSITIVE',
    25,
    'Archived public web captures were found for this website.',
  ));

  if (recordCount > 1) {
    signals.push(signal(
      'OPEN_WEB_MULTIPLE_CAPTURES_FOUND',
      'Multiple archived captures found',
      'INFO',
      8,
      'Multiple archived captures increase confidence that the site has been active.',
    ));
  }

  if (latestCaptureAt) {
    const ageDays = Math.floor((Date.now() - latestCaptureAt.getTime()) / DAY_MS);
    if (ageDays <= 180) {
      signals.push(signal(
        'OPEN_WEB_RECENTLY_SEEN',
        'Recently seen in public web archive',
        'POSITIVE',
        18,
        'The website was seen in a recent archive capture.',
      ));
    } else {
      signals.push(signal(
        'OPEN_WEB_STALE',
        'Archived evidence is stale',
        'WARNING',
        -10,
        'Archived evidence exists, but the most recent capture is older.',
      ));
    }
  }

  if (!archivedMetadata) {
    if (archivedHtmlFetched) {
      signals.push(signal(
        'ARCHIVED_SITE_UNAVAILABLE',
        'Archived page body unavailable',
        'WARNING',
        -8,
        'An archived capture exists, but no usable page body metadata was extracted.',
      ));
    }
    return signals;
  }

  signals.push(signal('HOMEPAGE_METADATA_FOUND', 'Homepage metadata found', 'POSITIVE', 12));
  if (archivedMetadata.title) signals.push(signal('TITLE_FOUND', 'Title found', 'POSITIVE', 10));
  if (archivedMetadata.description) signals.push(signal('DESCRIPTION_FOUND', 'Description found', 'POSITIVE', 8));
  if ((archivedMetadata.links?.contactLinks?.length || 0) > 0) signals.push(signal('CONTACT_PAGE_SIGNAL', 'Contact path found', 'POSITIVE', 10));
  if ((archivedMetadata.links?.menuLinks?.length || 0) > 0) signals.push(signal('MENU_PAGE_SIGNAL', 'Menu path found', 'INFO', 8));
  if ((archivedMetadata.links?.bookingLinks?.length || 0) > 0) signals.push(signal('BOOKING_PAGE_SIGNAL', 'Booking path found', 'INFO', 8));
  if ((archivedMetadata.links?.socialLinks?.length || 0) > 0) signals.push(signal('SOCIAL_LINK_SIGNAL', 'Social profile link found', 'INFO', 8));
  if ((archivedMetadata.links?.googleMapsLinks?.length || 0) > 0) signals.push(signal('GOOGLE_MAPS_LINK_SIGNAL', 'Maps link found', 'INFO', 6));
  if ((archivedMetadata.links?.emailHints?.length || 0) > 0) signals.push(signal('EMAIL_HINT_SIGNAL', 'Email hint found', 'POSITIVE', 8));
  if ((archivedMetadata.links?.phoneHints?.length || 0) > 0) signals.push(signal('PHONE_HINT_SIGNAL', 'Phone hint found', 'POSITIVE', 8));
  if (archivedMetadata.schema?.hasLocalBusinessSchema) signals.push(signal('LOCAL_BUSINESS_SCHEMA_SIGNAL', 'Local business schema found', 'POSITIVE', 12));
  if (archivedMetadata.schema?.hasOpeningHours) signals.push(signal('OPENING_HOURS_SCHEMA_SIGNAL', 'Opening hours schema found', 'INFO', 6));
  if (archivedMetadata.schema?.hasAddress) signals.push(signal('ADDRESS_SCHEMA_SIGNAL', 'Address schema found', 'POSITIVE', 10));
  if (archivedMetadata.schema?.hasAggregateRating) signals.push(signal('RATING_SCHEMA_SIGNAL', 'Rating schema found', 'INFO', 5));

  return dedupeSignals(signals);
};

const confidenceFromSignals = (signals = []) => {
  const total = signals.reduce((sum, item) => sum + (Number(item.confidenceContribution) || 0), 0);
  return Math.max(0, Math.min(95, 40 + total));
};

const businessNameFrom = ({ archivedMetadata, seedBusinessName = null, title = null }) => {
  const preferred = String(seedBusinessName || title || archivedMetadata?.title || '').trim();
  if (!preferred) return null;
  const normalized = preferred.toLowerCase();
  if (GENERIC_BUSINESS_NAMES.has(normalized)) return null;
  return preferred.length > 180 ? preferred.slice(0, 180) : preferred;
};

const restoreCacheRecord = (cacheRecord, overrides = {}) => {
  const metadata = cacheRecord.metadata || {};
  const latestCaptureAt = toDate(cacheRecord.captureTimestamp);
  return {
    enabled: true,
    found: true,
    insufficient: false,
    provider: 'common_crawl',
    publicLabel: 'Open Web Evidence',
    normalizedUrl: cacheRecord.normalizedUrl,
    normalizedDomain: cacheRecord.normalizedDomain,
    fromCache: true,
    cacheHit: true,
    durationMs: 0,
    timeout: false,
    skippedReason: null,
    archivedHtmlFetched: Boolean(metadata.archivedMetadata),
    indexId: cacheRecord.indexId || null,
    latestCaptureAt,
    captureCount: Number(metadata.captureCount) || 0,
    confidenceScore: Number(cacheRecord.confidenceScore) || 0,
    shouldSkipPaid: (Number(cacheRecord.confidenceScore) || 0) >= env.OPEN_WEB_EVIDENCE_MIN_CONFIDENCE_TO_SKIP_PAID,
    shouldSkipLiveFetch: Boolean(metadata.archivedMetadata),
    signals: Array.isArray(cacheRecord.signals) ? cacheRecord.signals : [],
    metadata: metadata.archivedMetadata || null,
    websiteProjection: metadata.websiteProjection || null,
    debug: metadata.debug || null,
    ...overrides,
  };
};

const buildNoopResult = (overrides = {}) => ({
  enabled: Boolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
  found: false,
  insufficient: true,
  provider: 'common_crawl',
  publicLabel: 'Open Web Evidence',
  normalizedUrl: null,
  normalizedDomain: null,
  fromCache: false,
  cacheHit: false,
  durationMs: 0,
  timeout: false,
  skippedReason: null,
  archivedHtmlFetched: false,
  indexId: null,
  latestCaptureAt: null,
  captureCount: 0,
  confidenceScore: 0,
  shouldSkipPaid: false,
  shouldSkipLiveFetch: false,
  signals: [],
  metadata: null,
  websiteProjection: null,
  debug: null,
  ...overrides,
});

const findCachedOpenWebEvidence = async ({ normalizedUrl }) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM "OpenWebEvidenceCache"
      WHERE "normalizedUrl" = ${normalizedUrl}
        AND "expiresAt" > NOW()
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    return rows[0] || null;
  } catch {
    return null;
  }
};

const deleteOpenWebEvidenceByHash = async ({ provider, evidenceHash }) => {
  try {
    await prisma.$executeRaw`
      DELETE FROM "OpenWebEvidenceCache"
      WHERE "provider" = ${provider}
        AND "evidenceHash" = ${evidenceHash}
    `;
  } catch {
    return;
  }
};

const insertOpenWebEvidenceCache = async ({
  normalizedDomain,
  normalizedUrl,
  provider,
  sourceType,
  indexId,
  captureTimestamp,
  evidenceHash,
  confidenceScore,
  signals,
  metadata,
  expiresAt,
}) => {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OpenWebEvidenceCache" (
        "id",
        "normalizedDomain",
        "normalizedUrl",
        "provider",
        "sourceType",
        "indexId",
        "captureTimestamp",
        "evidenceHash",
        "confidenceScore",
        "signals",
        "metadata",
        "expiresAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${crypto.randomUUID()},
        ${normalizedDomain},
        ${normalizedUrl},
        ${provider},
        ${sourceType},
        ${indexId},
        ${captureTimestamp},
        ${evidenceHash},
        ${confidenceScore},
        ${JSON.stringify(signals)}::jsonb,
        ${JSON.stringify(metadata)}::jsonb,
        ${expiresAt},
        NOW(),
        NOW()
      )
    `);
  } catch {
    return;
  }
};

export const lookupOpenWebEvidence = async ({ websiteUrl, forceRefresh = false } = {}) => {
  const startedAtMs = Date.now();

  if (!env.OPEN_WEB_EVIDENCE_ENABLED || !env.COMMON_CRAWL_ENABLED || env.OPEN_WEB_EVIDENCE_PROVIDER !== 'common_crawl') {
    return buildNoopResult({
      enabled: false,
      durationMs: elapsedMs(startedAtMs),
      skippedReason: 'DISABLED',
    });
  }

  let normalizedUrl;
  try {
    normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  } catch {
    return buildNoopResult({
      normalizedUrl: String(websiteUrl || '').trim() || null,
      durationMs: elapsedMs(startedAtMs),
      skippedReason: 'UNSAFE_URL',
      signals: [signal(
        'OPEN_WEB_EVIDENCE_SKIPPED_UNSAFE_URL',
        'Skipped unsafe URL',
        'WARNING',
        -20,
        'Open web evidence was skipped because the URL was not safe.',
      )],
    });
  }

  const normalizedDomain = domainForUrl(normalizedUrl);
  if (!forceRefresh) {
    const cached = await findCachedOpenWebEvidence({ normalizedUrl });
    if (cached) {
      return restoreCacheRecord(cached, {
        durationMs: elapsedMs(startedAtMs),
        cacheHit: true,
      });
    }
  }

  try {
    const lookup = await queryCommonCrawlIndex({ websiteUrl: normalizedUrl });
    const latestRecord = lookup.records[0] || null;
    const latestCaptureAt = latestRecord?.captureTimestamp || null;

    let archivedMetadata = null;
    let archivedHtmlFetched = false;
    if (latestRecord && env.OPEN_WEB_EVIDENCE_ENABLE_DOMAIN_ENRICHMENT) {
      const archivedHtml = await fetchArchivedHtmlFromRecord({ record: latestRecord });
      if (archivedHtml) {
        archivedHtmlFetched = true;
        archivedMetadata = extractWebsiteMetadata({ html: archivedHtml, finalUrl: latestRecord.url || normalizedUrl });
      }
    }

    const openWebSignals = buildOpenWebSignals({
      recordCount: lookup.records.length,
      latestCaptureAt,
      archivedMetadata,
      archivedHtmlFetched,
    });
    const confidenceScore = confidenceFromSignals(openWebSignals);
    const websiteSignals = archivedMetadata
      ? generateWebsiteOpportunitySignals({
          reachable: true,
          statusCode: 200,
          metadata: archivedMetadata,
          warnings: ['ARCHIVED_WEB_EVIDENCE'],
        })
      : [];

    const result = buildNoopResult({
      found: lookup.records.length > 0,
      insufficient: lookup.records.length === 0 || confidenceScore < 50,
      normalizedUrl,
      normalizedDomain,
      durationMs: elapsedMs(startedAtMs),
      cacheHit: false,
      archivedHtmlFetched,
      indexId: lookup.indexId,
      latestCaptureAt,
      captureCount: lookup.records.length,
      confidenceScore,
      shouldSkipPaid: confidenceScore >= env.OPEN_WEB_EVIDENCE_MIN_CONFIDENCE_TO_SKIP_PAID,
      shouldSkipLiveFetch: archivedMetadata && confidenceScore >= env.OPEN_WEB_EVIDENCE_MIN_CONFIDENCE_TO_SKIP_PAID,
      signals: openWebSignals,
      metadata: archivedMetadata,
      websiteProjection: archivedMetadata
        ? {
            websiteUrl: normalizedUrl,
            finalUrl: latestRecord?.url || normalizedUrl,
            reachable: true,
            statusCode: 200,
            fetchDurationMs: 0,
            metadata: archivedMetadata,
            signals: websiteSignals,
            warnings: ['ARCHIVED_WEB_EVIDENCE'],
            cached: false,
          }
        : null,
      debug: {
        latestRecord: latestRecord
          ? {
              url: latestRecord.url || normalizedUrl,
              timestamp: latestRecord.timestamp || null,
              mime: latestRecord.mime || latestRecord['mime-detected'] || null,
              status: latestRecord.status || null,
              filename: latestRecord.filename || null,
            }
          : null,
        recordCount: lookup.records.length,
      },
    });

    const cacheMetadata = sanitizeEvidenceMetadata({
      captureCount: result.captureCount,
      archivedMetadata: result.metadata,
      websiteProjection: result.websiteProjection,
      debug: result.debug,
    });

    const evidenceHash = buildEvidenceHash({
      normalizedUrl,
      latestCaptureAt,
      recordDigest: latestRecord?.digest || latestRecord?.filename || null,
      confidenceScore,
    });
    await deleteOpenWebEvidenceByHash({ provider: 'common_crawl', evidenceHash });
    await insertOpenWebEvidenceCache({
      normalizedDomain,
      normalizedUrl,
      provider: 'common_crawl',
      sourceType: 'OPEN_WEB_ARCHIVE',
      indexId: lookup.indexId,
      captureTimestamp: latestCaptureAt,
      evidenceHash,
      confidenceScore,
      signals: sanitizeEvidenceMetadata(result.signals),
      metadata: cacheMetadata,
      expiresAt: cacheExpiry(),
    });

    return {
      ...result,
      durationMs: elapsedMs(startedAtMs),
    };
  } catch (error) {
    if (env.OPEN_WEB_EVIDENCE_FAIL_OPEN) {
      logger.warn('open_web_evidence.lookup.failed', {
        normalizedUrl,
        errorCode: error?.code,
        errorMessage: error?.message,
      });
      const timeoutLike = error instanceof AppError && error.statusCode === 504;
      return buildNoopResult({
        normalizedUrl,
        normalizedDomain,
        durationMs: elapsedMs(startedAtMs),
        timeout: timeoutLike,
        skippedReason: timeoutLike ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        signals: [signal(
          timeoutLike ? 'OPEN_WEB_EVIDENCE_TIMEOUT' : 'ARCHIVED_EVIDENCE_INSUFFICIENT',
          timeoutLike ? 'Open web evidence timed out' : 'Archived evidence unavailable',
          'WARNING',
          -15,
          timeoutLike
            ? 'Open web evidence timed out and the search continued normally.'
            : 'Open web evidence was unavailable and the search continued normally.',
        )],
      });
    }
    throw error;
  }
};

const candidateUrlFromSeed = (seed) => seed.websiteUrl || seed.sourceUrl || seed.extractedFields?.websiteUrl || null;

const isPromotableName = (value) => {
  const trimmed = String(value || '').trim();
  if (trimmed.length < 3) return false;
  return !GENERIC_BUSINESS_NAMES.has(trimmed.toLowerCase());
};

const buildOpenWebCandidate = ({ result, campaign, seed }) => {
  if (!result?.found || result.confidenceScore < 55) return null;
  const businessName = businessNameFrom({
    archivedMetadata: result.metadata,
    seedBusinessName: seed.businessName || seed.title || seed.extractedFields?.businessName,
    title: result.metadata?.title,
  });
  const metadata = result.metadata || null;
  const category = seed.category || seed.extractedFields?.category || campaign.businessTypes?.[0] || null;
  const city = seed.city || seed.extractedFields?.city || campaign.city || null;
  const country = seed.country || seed.extractedFields?.country || campaign.country || null;
  const sourceUrl = result.normalizedUrl;
  const confidenceReasons = result.signals.map((item) => item.key);

  return {
    catalogLeadId: seed.catalogLeadId || null,
    promotableToCatalog: Boolean(!seed.catalogLeadId && isPromotableName(businessName) && sourceUrl),
    targetSource: 'WEBSITE',
    discoveryMethod: 'OPEN_WEB_EVIDENCE',
    sourceType: 'OPEN_WEB_ARCHIVE',
    sourceUrl,
    externalId: crypto.createHash('sha256').update(sourceUrl).digest('hex'),
    title: businessName || result.metadata?.title || sourceUrl,
    snippet: metadata?.description || `Archived public web evidence for ${sourceUrl}`,
    extractedFields: {
      businessName: businessName || null,
      category,
      city,
      country,
      websiteUrl: sourceUrl,
      phone: metadata?.links?.phoneHints?.[0] || null,
      email: metadata?.links?.emailHints?.[0] || null,
      provider: 'OPEN_WEB_EVIDENCE',
      archivedSignals: result.signals.map((item) => item.key),
      metadata: result.metadata,
    },
    rawMetadata: {
      provider: 'OPEN_WEB_EVIDENCE',
      internalProvider: 'COMMON_CRAWL',
      latestCaptureAt: result.latestCaptureAt?.toISOString?.() || null,
      captureCount: result.captureCount,
      confidenceReasons,
      paidProviderSkippedEligible: result.shouldSkipPaid,
      durationMs: result.durationMs,
      cacheHit: result.cacheHit,
      timeout: result.timeout,
      skippedReason: result.skippedReason,
    },
    confidenceScore: result.confidenceScore,
    attributionRequired: false,
  };
};

export const collectOpenWebEvidenceCandidates = async ({
  campaign,
  localResults = [],
  evidenceCandidates = [],
} = {}) => {
  const startedAtMs = Date.now();

  if (!env.OPEN_WEB_EVIDENCE_ENABLED || !env.OPEN_WEB_EVIDENCE_ENABLE_SEARCH_ASSIST) {
    return {
      openWebUsed: false,
      cacheHits: 0,
      linkedCandidates: [],
      promotableCandidates: [],
      results: [],
      durationMs: elapsedMs(startedAtMs),
      seedCount: 0,
      limitedSeedCount: 0,
      lookupCount: 0,
      skippedUnsafeSeedCount: 0,
      skippedReason: 'DISABLED',
    };
  }

  const seeds = [];
  const seenUrls = new Set();
  let skippedUnsafeSeedCount = 0;
  const addSeed = (seed) => {
    const candidateUrl = candidateUrlFromSeed(seed);
    if (!candidateUrl) return;
    let normalizedUrl;
    try {
      normalizedUrl = normalizeWebsiteUrl(candidateUrl);
    } catch {
      skippedUnsafeSeedCount += 1;
      return;
    }
    if (seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);
    seeds.push({ ...seed, websiteUrl: normalizedUrl });
  };

  for (const evidence of evidenceCandidates) {
    addSeed(evidence);
  }
  for (const lead of localResults) {
    addSeed({
      catalogLeadId: lead.id,
      businessName: lead.businessName,
      category: lead.category,
      city: lead.city,
      country: lead.country,
      websiteUrl: lead.websiteUrl,
    });
  }

  const limitedSeeds = seeds.slice(0, env.OPEN_WEB_EVIDENCE_MAX_URLS_PER_SEARCH);
  const results = [];
  let cacheHits = 0;
  for (const seed of limitedSeeds) {
    const result = await lookupOpenWebEvidence({ websiteUrl: seed.websiteUrl });
    if (result.fromCache || result.cacheHit) cacheHits += 1;
    const candidate = buildOpenWebCandidate({ result, campaign, seed });
    results.push({ seed, result, candidate });
  }

  return {
    openWebUsed: results.length > 0,
    cacheHits,
    linkedCandidates: results
      .map((item) => item.candidate)
      .filter((candidate) => candidate?.catalogLeadId),
    promotableCandidates: results
      .map((item) => item.candidate)
      .filter((candidate) => candidate?.promotableToCatalog),
    results,
    durationMs: elapsedMs(startedAtMs),
    seedCount: seeds.length,
    limitedSeedCount: limitedSeeds.length,
    lookupCount: results.length,
    skippedUnsafeSeedCount,
    skippedReason: results.length === 0 ? 'NO_ELIGIBLE_SEEDS' : null,
  };
};
