import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { safeFetchTextWithLimit } from '../../utils/safeFetch.js';

const CONTACT_WORDS = ['contact', 'email', 'phone', 'whatsapp', 'call us', 'get in touch'];
const CTA_WORDS = ['book', 'order', 'reserve', 'menu', 'shop', 'buy', 'appointment', 'quote', 'schedule'];
const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+/gi,
  facebook: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.-]+/gi,
  linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.-]+/gi,
};

const firstMatch = (html, pattern) => html.match(pattern)?.[0] || null;
const includesAny = (text, words) => words.some((word) => text.includes(word));

const extractMeta = (html, name) => {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(pattern)?.[1]?.trim() || null;
};

export const enrichWebsiteUrl = async (websiteUrl) => {
  // SSRF validation is now strictly handled inside safeFetchTextWithLimit
  // which validates protocol, internal IPs, DNS records, and redirects.
  
  const startedAt = Date.now();

  let result;
  let parsed;
  try {
    parsed = new URL(websiteUrl);
    result = await safeFetchTextWithLimit(websiteUrl, {
      timeoutMs: env.WEBSITE_FETCH_TIMEOUT_MS,
      maxBytes: 512_000,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === errorCodes.VALIDATION_ERROR) {
      throw error;
    }
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch failed safely.', 502);
  }

  const html = result.text || '';
  const lower = html.toLowerCase();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
  const metaDescription = extractMeta(html, 'description') || extractMeta(html, 'og:description');
  const hasContactWords = includesAny(lower, CONTACT_WORDS);
  const hasCtaWords = includesAny(lower, CTA_WORDS);
  const hasBookingWords = includesAny(lower, ['book', 'appointment', 'schedule', 'reserve']);
  const hasMenuWords = includesAny(lower, ['menu', 'order online', 'delivery']);
  const socialLinks = Object.fromEntries(
    Object.entries(SOCIAL_PATTERNS)
      .map(([key, pattern]) => [key, firstMatch(html, pattern)])
      .filter(([, value]) => value),
  );

  const detectedSignals = [];
  if (parsed.protocol === 'https:') detectedSignals.push('HAS_HTTPS');
  if (hasContactWords) detectedSignals.push('WEBSITE_HAS_CONTACT_SIGNAL');
  if (hasCtaWords) detectedSignals.push('WEBSITE_HAS_CTA_SIGNAL');
  if (hasBookingWords) detectedSignals.push('WEBSITE_HAS_BOOKING_SIGNAL');
  if (hasMenuWords) detectedSignals.push('WEBSITE_HAS_MENU_SIGNAL');
  if (Object.keys(socialLinks).length > 0) detectedSignals.push('WEBSITE_HAS_SOCIAL_LINKS');
  if (!title && !metaDescription) detectedSignals.push('WEBSITE_WEAK_METADATA');
  if (!hasContactWords && !hasCtaWords) detectedSignals.push('WEBSITE_WEAK_CONVERSION_SIGNAL');

  return {
    websiteStatus: result.ok ? 'FETCHED' : 'FETCH_FAILED',
    statusCode: result.status,
    contentType: result.contentType,
    responseTimeMs: Date.now() - startedAt,
    truncated: result.truncated,
    title,
    metaDescription,
    hasHttps: parsed.protocol === 'https:',
    hasContactWords,
    hasCtaWords,
    hasBookingWords,
    hasMenuWords,
    socialLinks,
    detectedSignals,
  };
};

export const mergeSignals = (existingSignals, newSignals) => {
  const current = Array.isArray(existingSignals) ? existingSignals : [];
  return [...new Set([...current, ...newSignals])];
};
