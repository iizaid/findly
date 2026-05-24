import { normalizeBusinessName, normalizeUrl } from './leadDeduplication.js';

const tokenize = (value) => normalizeBusinessName(value)
  .split(/\s+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 3);

const domainForUrl = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

const similarityScore = (left, right) => {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const matches = leftTokens.filter((token) => rightSet.has(token)).length;
  return matches / Math.max(leftTokens.length, rightTokens.length);
};

const officialWebsiteScore = ({ url, businessName, city, country, metadataTitle }) => {
  const domain = domainForUrl(url);
  if (!domain) return 0;
  let score = 0;
  const nameSimilarity = Math.max(
    similarityScore(businessName, domain.replace(/\.[a-z.]+$/i, '').replace(/[-_.]+/g, ' ')),
    similarityScore(businessName, metadataTitle),
  );
  if (nameSimilarity >= 0.45) score += 55;
  if ((city || '') && domain.includes(String(city).toLowerCase().replace(/\s+/g, ''))) score += 10;
  if ((country || '') && (metadataTitle || '').toLowerCase().includes(String(country).toLowerCase())) score += 10;
  return score;
};

const chooseIfCredible = ({ current, nextUrl, minScore = 45, score }) => {
  if (!nextUrl || score < minScore) return current;
  return !current || score > current.score ? { url: nextUrl, score } : current;
};

const socialTypeForUrl = (url) => {
  const host = domainForUrl(url);
  if (!host) return null;
  if (host.includes('instagram.com')) return 'instagramUrl';
  if (host.includes('facebook.com')) return 'facebookUrl';
  if (host.includes('linkedin.com')) return 'linkedInUrl';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youTubeUrl';
  if (host.includes('x.com') || host.includes('twitter.com')) return 'xUrl';
  if (host.includes('google.com') && host.includes('maps')) return 'googleMapsUrl';
  return null;
};

const socialCredibilityScore = ({ url, businessName, city }) => {
  const base = socialTypeForUrl(url) ? 40 : 0;
  const path = (() => {
    try {
      return new URL(url).pathname.replace(/[/_-]+/g, ' ');
    } catch {
      return '';
    }
  })();
  return base
    + (similarityScore(businessName, path) >= 0.35 ? 25 : 0)
    + (city && path.toLowerCase().includes(String(city).toLowerCase()) ? 10 : 0);
};

export const resolveOfficialLinks = ({
  candidate = {},
  websiteMetadata = null,
  contactExtraction = null,
  evidenceItems = [],
} = {}) => {
  const businessName = candidate.businessName || '';
  const city = candidate.city || '';
  const country = candidate.country || '';

  let officialWebsite = candidate.websiteUrl
    ? {
      url: candidate.websiteUrl,
      score: officialWebsiteScore({
        url: candidate.websiteUrl,
        businessName,
        city,
        country,
        metadataTitle: websiteMetadata?.title || '',
      }),
    }
    : null;

  const urlsToInspect = [
    candidate.websiteUrl,
    candidate.sourceUrl,
    candidate.instagramUrl,
    candidate.facebookUrl,
    candidate.googleMapsUrl,
    ...(contactExtraction?.sourceUrls || []),
    ...(evidenceItems || []).map((item) => item.sourceUrl).filter(Boolean),
  ].filter(Boolean);

  for (const url of urlsToInspect) {
    if (!url) continue;
    if (!socialTypeForUrl(url)) {
      officialWebsite = chooseIfCredible({
        current: officialWebsite,
        nextUrl: url,
        score: officialWebsiteScore({
          url,
          businessName,
          city,
          country,
          metadataTitle: websiteMetadata?.title || '',
        }),
      });
    }
  }

  const resolved = {
    websiteUrl: officialWebsite?.score >= 45 ? officialWebsite.url : (candidate.websiteUrl || null),
    instagramUrl: contactExtraction?.instagramUrl || candidate.instagramUrl || null,
    facebookUrl: contactExtraction?.facebookUrl || candidate.facebookUrl || null,
    linkedInUrl: contactExtraction?.linkedInUrl || null,
    youTubeUrl: contactExtraction?.youTubeUrl || null,
    xUrl: contactExtraction?.xUrl || null,
    googleMapsUrl: contactExtraction?.googleMapsUrl || candidate.googleMapsUrl || null,
    contactPageUrl: contactExtraction?.contactPageUrl || null,
    bookingLink: contactExtraction?.bookingLink || null,
    menuLink: contactExtraction?.menuLink || null,
  };

  for (const key of ['instagramUrl', 'facebookUrl', 'linkedInUrl', 'youTubeUrl', 'xUrl', 'googleMapsUrl']) {
    const url = resolved[key];
    if (!url) continue;
    const score = socialCredibilityScore({ url, businessName, city });
    if (score <= 40) resolved[key] = null;
  }

  const sourceUrls = [...new Set([
    ...urlsToInspect,
    resolved.websiteUrl,
    resolved.instagramUrl,
    resolved.facebookUrl,
    resolved.linkedInUrl,
    resolved.youTubeUrl,
    resolved.xUrl,
    resolved.googleMapsUrl,
    resolved.contactPageUrl,
    resolved.bookingLink,
    resolved.menuLink,
  ].filter(Boolean).map((url) => normalizeUrl(url) ? url : null).filter(Boolean))];

  return {
    ...resolved,
    sourceUrls,
    resolvedCount: [
      resolved.websiteUrl,
      resolved.instagramUrl,
      resolved.facebookUrl,
      resolved.linkedInUrl,
      resolved.youTubeUrl,
      resolved.xUrl,
      resolved.googleMapsUrl,
      resolved.contactPageUrl,
      resolved.bookingLink,
      resolved.menuLink,
    ].filter(Boolean).length,
    officialWebsiteConfidence: officialWebsite?.score || 0,
  };
};
