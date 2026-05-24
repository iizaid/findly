import { safeFetchTextWithLimit } from '../../utils/safeFetch.js';
import { normalizePhone } from './leadDeduplication.js';
import { extractWebsiteMetadata, normalizeWebsiteUrl } from './websiteMetadata.service.js';

const MAX_PAGES_PER_BUSINESS = 4;
const MAX_HTML_BYTES = 250_000;

const EMAIL_BLOCKLIST = [
  'example.com',
  'example.org',
  'facebookmail.com',
  'support.facebook.com',
  'privacy.google.com',
  'sentry.io',
  'cloudflare.com',
  'doubleclick.net',
];

const normalizeEmail = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  if (EMAIL_BLOCKLIST.some((domain) => normalized.endsWith(`@${domain}`) || normalized.includes(domain))) return null;
  return normalized;
};

const domainForUrl = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

const absoluteUrl = (value, baseUrl) => {
  try {
    const parsed = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const addItem = (bucket, type, value, sourceUrl, extra = {}) => {
  if (!value) return;
  if (bucket.some((item) => item.type === type && item.value === value)) return;
  bucket.push({ type, value, sourceUrl, ...extra });
};

const extractEmailsFromHtml = (html) => {
  const matches = [...String(html || '').matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)];
  return [...new Set(matches.map((match) => normalizeEmail(match[0])).filter(Boolean))];
};

const extractPhoneHintsFromHtml = (html) => {
  const matches = [...String(html || '').matchAll(/(\+?\d[\d\s().-]{6,}\d)/g)];
  return [...new Set(matches.map((match) => normalizePhone(match[1])).filter(Boolean))];
};

const uniqueUrls = (values = []) => [...new Set(values.filter(Boolean))];

const filterRelevantEmails = (emails = [], websiteUrl) => {
  const websiteDomain = domainForUrl(websiteUrl);
  if (!websiteDomain) return emails;
  return emails.filter((email) => {
    const emailDomain = email.split('@')[1];
    if (!emailDomain) return false;
    return emailDomain === websiteDomain
      || websiteDomain.endsWith(`.${emailDomain}`)
      || emailDomain.endsWith(`.${websiteDomain}`)
      || ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(emailDomain);
  });
};

export const extractContactItemsFromMetadata = ({ metadata, sourceUrl }) => {
  const items = [];
  const links = metadata?.links || {};

  for (const email of links.emailHints || []) addItem(items, 'email', normalizeEmail(email), sourceUrl);
  for (const phone of links.phoneHints || []) addItem(items, 'phone', normalizePhone(phone), sourceUrl);
  for (const link of links.whatsAppLinks || []) addItem(items, 'whatsapp', link, sourceUrl);
  for (const link of links.contactLinks || []) addItem(items, 'contact_page', link, sourceUrl);
  for (const link of links.bookingLinks || []) addItem(items, 'booking', link, sourceUrl);
  for (const link of links.menuLinks || []) addItem(items, 'menu', link, sourceUrl);
  for (const link of links.socialLinks || []) {
    const host = domainForUrl(link);
    if (host?.includes('instagram.com')) addItem(items, 'instagram', link, sourceUrl);
    else if (host?.includes('facebook.com')) addItem(items, 'facebook', link, sourceUrl);
    else if (host?.includes('linkedin.com')) addItem(items, 'linkedin', link, sourceUrl);
    else if (host?.includes('youtube.com') || host?.includes('youtu.be')) addItem(items, 'youtube', link, sourceUrl);
    else if (host?.includes('x.com') || host?.includes('twitter.com')) addItem(items, 'x', link, sourceUrl);
  }
  for (const link of links.googleMapsLinks || []) addItem(items, 'google_maps', link, sourceUrl);

  return items.filter((item) => item.value);
};

export const extractPublicContactData = async ({
  websiteUrl,
  sourceHtml = null,
  businessName = '',
  city = '',
  country = '',
  fetcher = safeFetchTextWithLimit,
  maxPages = MAX_PAGES_PER_BUSINESS,
} = {}) => {
  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const seedHtml = sourceHtml ? String(sourceHtml).slice(0, MAX_HTML_BYTES) : null;
  const homepageResult = seedHtml
    ? {
      url: normalizedWebsiteUrl,
      html: seedHtml,
      metadata: extractWebsiteMetadata({ html: seedHtml, finalUrl: normalizedWebsiteUrl }),
    }
    : (() => null)();

  const pages = [];
  if (homepageResult) pages.push(homepageResult);
  if (!homepageResult) {
    const response = await fetcher(normalizedWebsiteUrl, {
      timeoutMs: 7000,
      maxBytes: MAX_HTML_BYTES,
      maxRedirects: 3,
      userAgent: 'FindlyBot/1.0 (+public contact extraction)',
    });
    pages.push({
      url: response.finalUrl || normalizedWebsiteUrl,
      html: String(response.text || '').slice(0, MAX_HTML_BYTES),
      metadata: response.text ? extractWebsiteMetadata({ html: response.text, finalUrl: response.finalUrl || normalizedWebsiteUrl }) : null,
    });
  }

  const candidatePaths = uniqueUrls([
    ...(pages[0]?.metadata?.links?.contactLinks || []),
    ...(pages[0]?.metadata?.links?.bookingLinks || []),
    ...(pages[0]?.metadata?.links?.menuLinks || []),
    absoluteUrl('/contact', pages[0]?.url || normalizedWebsiteUrl),
    absoluteUrl('/contact-us', pages[0]?.url || normalizedWebsiteUrl),
    absoluteUrl('/about', pages[0]?.url || normalizedWebsiteUrl),
    absoluteUrl('/booking', pages[0]?.url || normalizedWebsiteUrl),
    absoluteUrl('/menu', pages[0]?.url || normalizedWebsiteUrl),
  ]).slice(0, Math.max(0, maxPages - 1));

  for (const pageUrl of candidatePaths) {
    try {
      const response = await fetcher(pageUrl, {
        timeoutMs: 5000,
        maxBytes: MAX_HTML_BYTES,
        maxRedirects: 2,
        userAgent: 'FindlyBot/1.0 (+public contact extraction)',
      });
      if (!response?.text) continue;
      pages.push({
        url: response.finalUrl || pageUrl,
        html: String(response.text).slice(0, MAX_HTML_BYTES),
        metadata: extractWebsiteMetadata({ html: response.text, finalUrl: response.finalUrl || pageUrl }),
      });
      if (pages.length >= maxPages) break;
    } catch {
      // Fail open per page.
    }
  }

  const contactItems = [];
  const sourceUrls = [];
  const evidenceItems = [];

  for (const page of pages) {
    sourceUrls.push(page.url);
    for (const item of extractContactItemsFromMetadata({ metadata: page.metadata, sourceUrl: page.url })) {
      addItem(contactItems, item.type, item.value, item.sourceUrl);
    }
    for (const email of filterRelevantEmails(extractEmailsFromHtml(page.html), normalizedWebsiteUrl)) {
      addItem(contactItems, 'email', email, page.url);
    }
    for (const phone of extractPhoneHintsFromHtml(page.html)) {
      addItem(contactItems, 'phone', phone, page.url);
    }

    evidenceItems.push({
      sourceUrl: page.url,
      pageTitle: page.metadata?.title || null,
      pageDescription: page.metadata?.description || null,
      businessName,
      city,
      country,
      contactTypes: [...new Set(contactItems.filter((item) => item.sourceUrl === page.url).map((item) => item.type))],
    });
  }

  return {
    websiteUrl: normalizedWebsiteUrl,
    crawledPages: pages.length,
    sourceUrls: uniqueUrls(sourceUrls),
    contactItems,
    phoneNumbers: [...new Set(contactItems.filter((item) => item.type === 'phone').map((item) => item.value))],
    emails: [...new Set(contactItems.filter((item) => item.type === 'email').map((item) => item.value))],
    whatsappLinks: uniqueUrls(contactItems.filter((item) => item.type === 'whatsapp').map((item) => item.value)),
    contactPageUrl: contactItems.find((item) => item.type === 'contact_page')?.value || null,
    bookingLink: contactItems.find((item) => item.type === 'booking')?.value || null,
    menuLink: contactItems.find((item) => item.type === 'menu')?.value || null,
    instagramUrl: contactItems.find((item) => item.type === 'instagram')?.value || null,
    facebookUrl: contactItems.find((item) => item.type === 'facebook')?.value || null,
    linkedInUrl: contactItems.find((item) => item.type === 'linkedin')?.value || null,
    youTubeUrl: contactItems.find((item) => item.type === 'youtube')?.value || null,
    xUrl: contactItems.find((item) => item.type === 'x')?.value || null,
    googleMapsUrl: contactItems.find((item) => item.type === 'google_maps')?.value || null,
    evidenceItems,
  };
};

export const summarizeContactExtraction = (contactData = {}) => ({
  phoneCount: contactData.phoneNumbers?.length || 0,
  emailCount: contactData.emails?.length || 0,
  socialCount: [
    contactData.instagramUrl,
    contactData.facebookUrl,
    contactData.linkedInUrl,
    contactData.youTubeUrl,
    contactData.xUrl,
  ].filter(Boolean).length,
  officialLinkCount: [
    contactData.websiteUrl,
    contactData.contactPageUrl,
    contactData.bookingLink,
    contactData.menuLink,
    contactData.googleMapsUrl,
  ].filter(Boolean).length,
});
