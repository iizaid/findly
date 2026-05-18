import crypto from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { isSafeIp, safeFetchTextWithLimit } from '../../utils/safeFetch.js';
import { assertSourceAllowedForStage, STAGES } from './sourceIntelligencePolicy.service.js';
import { recordLeadEvidence } from './discoveryEvidence.service.js';

const DEFAULT_LINK_LIMITS = {
  contactLinks: 5,
  menuLinks: 5,
  bookingLinks: 5,
  socialLinks: 10,
  emailHints: 5,
  phoneHints: 5,
};

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'spm',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

const privateHostPattern = /(^|\.)localhost$/i;

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const decodeHtmlEntities = (value) => normalizeWhitespace(value)
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&nbsp;/gi, ' ');

const stripTags = (value) => decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '));

const hostnameIsBlocked = (hostname) => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (!host || BLOCKED_HOSTS.has(host) || privateHostPattern.test(host)) return true;
  if (ipaddr.isValid(ipHost) && !isSafeIp(ipHost)) return true;
  return false;
};

export const normalizeWebsiteUrl = (value) => {
  const input = String(value || '').trim();
  if (!input) throw new AppError(errorCodes.VALIDATION_ERROR, 'Website URL is required.', 400);

  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid website URL.', 400);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Website URL must use http or https.', 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Website URL credentials are not allowed.', 400);
  }
  if (hostnameIsBlocked(parsed.hostname)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Website URL host is not allowed.', 400);
  }

  parsed.hash = '';
  for (const param of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) parsed.searchParams.delete(param);
  }

  return parsed.toString();
};

const attributeValue = (tag, name) => {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return decodeHtmlEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? '');
};

const firstMatch = (html, pattern) => decodeHtmlEntities(html.match(pattern)?.[1] || '');

const findMetaContent = (html, selectorName, selectorValue) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const expected = selectorValue.toLowerCase();
  for (const tag of tags) {
    const actual = attributeValue(tag, selectorName).toLowerCase();
    if (actual === expected) return attributeValue(tag, 'content');
  }
  return '';
};

const findLinkHref = (html, relValue) => {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = attributeValue(tag, 'rel').toLowerCase().split(/\s+/);
    if (rel.includes(relValue)) return attributeValue(tag, 'href');
  }
  return '';
};

const safeAbsoluteUrl = (href, baseUrl) => {
  try {
    const parsed = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (hostnameIsBlocked(parsed.hostname)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

const classifyLink = ({ href, text, baseUrl }) => {
  const rawHref = String(href || '').trim();
  const lowerHref = rawHref.toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  const absolute = safeAbsoluteUrl(rawHref, baseUrl);

  if (lowerHref.startsWith('mailto:')) {
    return { category: 'emailHints', value: lowerHref.replace(/^mailto:/, '').split('?')[0].slice(0, 160) };
  }
  if (lowerHref.startsWith('tel:')) {
    return { category: 'phoneHints', value: lowerHref.replace(/^tel:/, '').slice(0, 80) };
  }
  if (lowerHref.startsWith('https://wa.me/') || lowerHref.startsWith('http://wa.me/') || lowerHref.includes('whatsapp.com/')) {
    return { category: 'whatsAppLinks', value: absolute || rawHref.slice(0, 500) };
  }
  if (!absolute) return null;

  const combined = `${lowerHref} ${lowerText}`;
  if (combined.includes('instagram.com') || combined.includes('facebook.com') || combined.includes('tiktok.com') || combined.includes('x.com') || combined.includes('twitter.com')) {
    return { category: 'socialLinks', value: absolute };
  }
  if (combined.includes('google.com/maps') || combined.includes('maps.app.goo.gl')) {
    return { category: 'googleMapsLinks', value: absolute };
  }
  if (/\b(contact|contact-us|about|location|directions)\b/.test(combined)) return { category: 'contactLinks', value: absolute };
  if (/\b(menu|menus|food|drinks)\b/.test(combined)) return { category: 'menuLinks', value: absolute };
  if (/\b(book|booking|reserve|reservation|appointment|order)\b/.test(combined)) return { category: 'bookingLinks', value: absolute };
  return null;
};

const limitedPush = (target, value, limit) => {
  if (!value || target.includes(value) || target.length >= limit) return;
  target.push(value);
};

const extractLinks = (html, baseUrl) => {
  const links = {
    contactLinks: [],
    menuLinks: [],
    bookingLinks: [],
    whatsAppLinks: [],
    socialLinks: [],
    googleMapsLinks: [],
    emailHints: [],
    phoneHints: [],
  };

  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[2] ?? match[3] ?? match[4] ?? '';
    const text = stripTags(match[5] || '');
    const classified = classifyLink({ href, text, baseUrl });
    if (!classified) continue;
    const limit = DEFAULT_LINK_LIMITS[classified.category] || 5;
    limitedPush(links[classified.category], classified.value, limit);
  }

  return links;
};

const extractJsonLd = (html) => {
  const scripts = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1].trim();
    if (!raw || raw.length > 50_000) continue;
    try {
      scripts.push(JSON.parse(raw));
    } catch {
      scripts.push({ parseError: true });
    }
    if (scripts.length >= 5) break;
  }
  return scripts;
};

const flattenSchemaTypes = (node, output = []) => {
  if (!node || typeof node !== 'object') return output;
  if (Array.isArray(node)) {
    for (const item of node) flattenSchemaTypes(item, output);
    return output;
  }
  if (node['@type']) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    output.push(...types.map((type) => String(type)));
  }
  if (node['@graph']) flattenSchemaTypes(node['@graph'], output);
  return output;
};

const schemaContainsField = (node, field) => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => schemaContainsField(item, field));
  if (Object.prototype.hasOwnProperty.call(node, field)) return true;
  return Object.values(node).some((value) => typeof value === 'object' && schemaContainsField(value, field));
};

export const extractWebsiteMetadata = ({ html, finalUrl }) => {
  const safeHtml = String(html || '').slice(0, env.WEBSITE_FETCH_MAX_BYTES);
  const title = firstMatch(safeHtml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = findMetaContent(safeHtml, 'name', 'description');
  const canonicalHref = findLinkHref(safeHtml, 'canonical');
  const canonicalUrl = canonicalHref ? safeAbsoluteUrl(canonicalHref, finalUrl) : null;
  const links = extractLinks(safeHtml, finalUrl);
  const jsonLd = extractJsonLd(safeHtml);
  const schemaTypes = [...new Set(jsonLd.flatMap((entry) => flattenSchemaTypes(entry)))];
  const bodyText = stripTags(safeHtml);
  const visibleTextLength = bodyText.length;

  return {
    title: title || null,
    description: description || null,
    canonicalUrl,
    ogTitle: findMetaContent(safeHtml, 'property', 'og:title') || null,
    ogDescription: findMetaContent(safeHtml, 'property', 'og:description') || null,
    ogUrl: findMetaContent(safeHtml, 'property', 'og:url') || null,
    language: firstMatch(safeHtml, /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i) || null,
    robotsMeta: findMetaContent(safeHtml, 'name', 'robots') || null,
    links,
    schema: {
      hasJsonLd: jsonLd.length > 0,
      schemaTypes,
      hasLocalBusinessSchema: schemaTypes.some((type) => /LocalBusiness|Restaurant|CafeOrCoffeeShop|Store/i.test(type)),
      hasOpeningHours: jsonLd.some((entry) => schemaContainsField(entry, 'openingHours') || schemaContainsField(entry, 'openingHoursSpecification')),
      hasAggregateRating: jsonLd.some((entry) => schemaContainsField(entry, 'aggregateRating')),
      hasAddress: jsonLd.some((entry) => schemaContainsField(entry, 'address')),
    },
    page: {
      visibleTextLength,
      approximateHtmlBytes: Buffer.byteLength(safeHtml, 'utf8'),
      possiblePlaceholder: visibleTextLength < 300 || /coming soon|under construction|parking page|domain for sale/i.test(bodyText),
    },
  };
};

const signal = (key, severity, confidence, reason, support = null) => ({
  key,
  severity,
  confidence,
  reason,
  support,
});

export const generateWebsiteOpportunitySignals = ({ reachable, statusCode, metadata = {}, warnings = [] }) => {
  const signals = [];
  if (!reachable) {
    signals.push(signal(
      warnings.includes('WEBSITE_TIMEOUT') ? 'WEBSITE_TIMEOUT' : 'WEBSITE_UNREACHABLE',
      'ERROR',
      90,
      warnings.includes('WEBSITE_TIMEOUT') ? 'Website metadata request timed out.' : 'Website homepage could not be reached safely.',
      { statusCode },
    ));
    return signals;
  }

  signals.push(signal('WEBSITE_REACHABLE', 'POSITIVE', 85, 'Website homepage responded to a safe metadata fetch.', { statusCode }));
  if (warnings.includes('WEBSITE_REDIRECTED')) signals.push(signal('WEBSITE_REDIRECTED', 'INFO', 70, 'Website redirected before returning homepage metadata.'));
  if (warnings.includes('WEBSITE_NON_HTML')) signals.push(signal('WEBSITE_NON_HTML', 'WARNING', 80, 'Website did not return an HTML homepage.'));

  const titleLength = metadata.title?.length || 0;
  const descriptionLength = metadata.description?.length || 0;
  const links = metadata.links || {};
  const hasContact = (links.contactLinks?.length || 0) > 0 || (links.emailHints?.length || 0) > 0 || (links.phoneHints?.length || 0) > 0 || (links.whatsAppLinks?.length || 0) > 0;
  const hasMenu = (links.menuLinks?.length || 0) > 0;
  const hasBooking = (links.bookingLinks?.length || 0) > 0;
  const hasSocial = (links.socialLinks?.length || 0) > 0;

  signals.push(titleLength > 0
    ? signal('HAS_TITLE', 'POSITIVE', 75, 'Homepage has a title tag.', { title: metadata.title })
    : signal('WEAK_TITLE', 'OPPORTUNITY', 80, 'Homepage is missing a usable title tag.'));
  if (titleLength > 0 && titleLength < 12) signals.push(signal('WEAK_TITLE', 'WARNING', 70, 'Homepage title is very short.', { title: metadata.title }));

  signals.push(descriptionLength >= 50
    ? signal('HAS_META_DESCRIPTION', 'POSITIVE', 75, 'Homepage has a useful meta description.')
    : signal(descriptionLength > 0 ? 'WEAK_META_DESCRIPTION' : 'WEAK_META_DESCRIPTION', 'OPPORTUNITY', 75, 'Homepage meta description is missing or too thin.'));

  signals.push(hasContact
    ? signal('HAS_CONTACT_LINK', 'POSITIVE', 85, 'Homepage exposes an obvious contact path.')
    : signal('MISSING_CONTACT_LINK', 'OPPORTUNITY', 80, 'Homepage did not expose an obvious contact, mailto, tel, or WhatsApp link.'));
  signals.push(hasMenu
    ? signal('HAS_MENU_LINK', 'POSITIVE', 75, 'Homepage exposes a menu link.')
    : signal('MISSING_MENU_LINK', 'OPPORTUNITY', 65, 'Homepage did not expose an obvious menu link.'));
  signals.push(hasBooking
    ? signal('HAS_BOOKING_LINK', 'POSITIVE', 75, 'Homepage exposes a booking, reservation, order, or appointment path.')
    : signal('MISSING_BOOKING_LINK', 'OPPORTUNITY', 60, 'Homepage did not expose an obvious booking or reservation path.'));

  if ((links.whatsAppLinks?.length || 0) > 0) signals.push(signal('HAS_WHATSAPP_LINK', 'POSITIVE', 85, 'Homepage exposes a WhatsApp link.'));
  if ((links.emailHints?.length || 0) > 0) signals.push(signal('HAS_EMAIL_LINK', 'POSITIVE', 80, 'Homepage exposes an email link.'));
  if ((links.phoneHints?.length || 0) > 0) signals.push(signal('HAS_PHONE_LINK', 'POSITIVE', 80, 'Homepage exposes a phone link.'));
  if (hasSocial) signals.push(signal('HAS_SOCIAL_LINKS', 'INFO', 75, 'Homepage links to social profiles.'));
  if (links.socialLinks?.some((url) => url.includes('instagram.com'))) signals.push(signal('HAS_INSTAGRAM_LINK', 'INFO', 80, 'Homepage links to Instagram.'));
  if (links.socialLinks?.some((url) => url.includes('facebook.com'))) signals.push(signal('HAS_FACEBOOK_LINK', 'INFO', 80, 'Homepage links to Facebook.'));
  if ((links.googleMapsLinks?.length || 0) > 0) signals.push(signal('HAS_GOOGLE_MAPS_LINK', 'INFO', 75, 'Homepage links to Google Maps.'));

  if (metadata.schema?.hasJsonLd) signals.push(signal('HAS_SCHEMA_ORG', 'POSITIVE', 75, 'Homepage includes JSON-LD structured data.'));
  if (metadata.schema?.hasLocalBusinessSchema) signals.push(signal('HAS_LOCAL_BUSINESS_SCHEMA', 'POSITIVE', 80, 'Homepage includes local business structured data.'));
  if (metadata.page?.possiblePlaceholder) signals.push(signal('POSSIBLE_PLACEHOLDER_SITE', 'OPPORTUNITY', 70, 'Homepage looks sparse or placeholder-like.'));

  signals.push(hasContact && (hasBooking || hasMenu)
    ? signal('STRONG_CONVERSION_PATH', 'POSITIVE', 80, 'Homepage has contact plus menu or booking paths.')
    : signal('WEAK_CONVERSION_PATH', 'OPPORTUNITY', 75, 'Homepage is missing one or more obvious conversion paths.'));

  return signals;
};

const confidenceFromSignals = (signals) => {
  const reachable = signals.some((item) => item.key === 'WEBSITE_REACHABLE');
  const positives = signals.filter((item) => item.severity === 'POSITIVE').length;
  const opportunities = signals.filter((item) => item.severity === 'OPPORTUNITY' || item.severity === 'WARNING').length;
  if (!reachable) return 35;
  return Math.max(45, Math.min(90, 55 + positives * 4 + opportunities * 2));
};

const cacheCutoffDate = () => new Date(Date.now() - (env.WEBSITE_ENRICHMENT_TTL_DAYS * 24 * 60 * 60 * 1000));

const buildCachedResult = (evidence) => ({
  websiteUrl: evidence.sourceUrl,
  finalUrl: evidence.rawMetadata?.finalUrl || evidence.sourceUrl,
  reachable: evidence.rawMetadata?.reachable ?? true,
  statusCode: evidence.rawMetadata?.statusCode || null,
  fetchDurationMs: evidence.rawMetadata?.fetchDurationMs || 0,
  metadata: evidence.extractedFields?.metadata || null,
  signals: evidence.extractedFields?.signals || [],
  evidenceId: evidence.id,
  observedAt: evidence.observedAt,
  warnings: ['CACHE_HIT'],
  cached: true,
});

export const formatWebsiteIntelligenceEvidence = (evidence, { cached = false } = {}) => {
  if (!evidence) return null;
  return {
    leadId: evidence.leadId || null,
    catalogLeadId: evidence.catalogLeadId || null,
    websiteUrl: evidence.sourceUrl,
    finalUrl: evidence.rawMetadata?.finalUrl || evidence.sourceUrl,
    reachable: Boolean(evidence.rawMetadata?.reachable),
    statusCode: evidence.rawMetadata?.statusCode || null,
    cached,
    observedAt: evidence.observedAt,
    evidenceId: evidence.id,
    metadata: evidence.extractedFields?.metadata || null,
    signals: evidence.extractedFields?.signals || [],
    warnings: evidence.rawMetadata?.warnings || [],
  };
};

export const findRecentWebsiteMetadataEvidence = async ({ leadId = null, catalogLeadId = null, websiteUrl }) => {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  return prisma.leadEvidence.findFirst({
    where: {
      leadId: leadId || undefined,
      catalogLeadId: catalogLeadId || undefined,
      discoveryMethod: 'WEBSITE_METADATA',
      sourceType: 'WEBSITE_METADATA',
      sourceUrl: normalizedUrl,
      observedAt: { gte: cacheCutoffDate() },
    },
    orderBy: { observedAt: 'desc' },
  });
};

export const getLatestWebsiteIntelligenceEvidence = async ({ leadId = null, catalogLeadId = null } = {}) => {
  if (!leadId && !catalogLeadId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'leadId or catalogLeadId is required.', 400);
  }
  const evidence = await prisma.leadEvidence.findFirst({
    where: {
      leadId: leadId || undefined,
      catalogLeadId: catalogLeadId || undefined,
      discoveryMethod: 'WEBSITE_METADATA',
      sourceType: 'WEBSITE_METADATA',
    },
    orderBy: { observedAt: 'desc' },
  });
  return formatWebsiteIntelligenceEvidence(evidence);
};

export const analyzeWebsiteMetadata = async ({ websiteUrl, fetcher = safeFetchTextWithLimit } = {}) => {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  const started = Date.now();
  const warnings = [];

  try {
    const response = await fetcher(normalizedUrl, {
      timeoutMs: env.WEBSITE_FETCH_TIMEOUT_MS,
      maxBytes: env.WEBSITE_FETCH_MAX_BYTES,
      maxRedirects: env.WEBSITE_FETCH_MAX_REDIRECTS,
    });
    const fetchDurationMs = Date.now() - started;
    if (response.redirectsFollowed > 0 || response.finalUrl !== normalizedUrl) warnings.push('WEBSITE_REDIRECTED');
    if (response.truncated) warnings.push('WEBSITE_TRUNCATED');
    if (!String(response.contentType || '').toLowerCase().includes('html')) warnings.push('WEBSITE_NON_HTML');

    const metadata = response.text ? extractWebsiteMetadata({ html: response.text, finalUrl: response.finalUrl || normalizedUrl }) : null;
    const signals = generateWebsiteOpportunitySignals({
      reachable: Boolean(response.ok),
      statusCode: response.status,
      metadata: metadata || {},
      warnings,
    });

    return {
      websiteUrl: normalizedUrl,
      finalUrl: response.finalUrl || normalizedUrl,
      reachable: Boolean(response.ok),
      statusCode: response.status,
      fetchDurationMs,
      metadata,
      signals,
      warnings,
    };
  } catch (error) {
    const timeout = /timed out/i.test(error.message || '');
    const localWarnings = timeout ? ['WEBSITE_TIMEOUT'] : ['WEBSITE_UNREACHABLE'];
    return {
      websiteUrl: normalizedUrl,
      finalUrl: normalizedUrl,
      reachable: false,
      statusCode: null,
      fetchDurationMs: Date.now() - started,
      metadata: null,
      signals: generateWebsiteOpportunitySignals({ reachable: false, warnings: localWarnings }),
      warnings: localWarnings,
    };
  }
};

export const enrichLeadWebsite = async ({
  leadId = null,
  catalogLeadId = null,
  websiteUrl,
  requestedByUserId,
  workspaceId,
  forceRefresh = false,
  fetcher = safeFetchTextWithLimit,
} = {}) => {
  const policyCheck = assertSourceAllowedForStage('WEBSITE_METADATA', STAGES.WEBSITE_ENRICHMENT);
  if (!policyCheck.allowed) throw new AppError(errorCodes.FORBIDDEN, policyCheck.reason, 403);
  if (!leadId && !catalogLeadId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'leadId or catalogLeadId is required for website enrichment.', 400);
  }
  if (!requestedByUserId || !workspaceId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'requestedByUserId and workspaceId are required for website enrichment.', 400);
  }

  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  if (!forceRefresh) {
    const cached = await findRecentWebsiteMetadataEvidence({ leadId, catalogLeadId, websiteUrl: normalizedUrl });
    if (cached) return buildCachedResult(cached);
  }

  const analysis = await analyzeWebsiteMetadata({ websiteUrl: normalizedUrl, fetcher });
  const evidence = await prisma.$transaction(async (tx) => recordLeadEvidence({
    tx,
    userId: requestedByUserId,
    workspaceId,
    leadId,
    catalogLeadId,
    targetSource: 'WEBSITE',
    discoveryMethod: 'WEBSITE_METADATA',
    sourceType: 'WEBSITE_METADATA',
    sourceUrl: normalizedUrl,
    externalId: crypto.createHash('sha256').update(normalizedUrl).digest('hex'),
    title: analysis.metadata?.title || normalizedUrl,
    snippet: analysis.metadata?.description || analysis.signals.map((item) => item.key).join(', '),
    extractedFields: {
      websiteUrl: normalizedUrl,
      finalUrl: analysis.finalUrl,
      metadata: analysis.metadata,
      signals: analysis.signals,
    },
    rawMetadata: {
      reachable: analysis.reachable,
      statusCode: analysis.statusCode,
      finalUrl: analysis.finalUrl,
      fetchDurationMs: analysis.fetchDurationMs,
      warnings: analysis.warnings,
      limits: {
        timeoutMs: env.WEBSITE_FETCH_TIMEOUT_MS,
        maxBytes: env.WEBSITE_FETCH_MAX_BYTES,
        maxRedirects: env.WEBSITE_FETCH_MAX_REDIRECTS,
      },
    },
    confidenceScore: confidenceFromSignals(analysis.signals),
    robotsStatus: analysis.metadata?.robotsMeta || null,
  }));

  return {
    ...analysis,
    evidenceId: evidence.id,
    observedAt: evidence.observedAt,
    cached: false,
  };
};
