import crypto from 'node:crypto';

const PLATFORM_HOSTS = Object.freeze({
  INSTAGRAM: ['instagram.com'],
  TIKTOK: ['tiktok.com'],
  FACEBOOK: ['facebook.com', 'fb.com'],
  REDDIT: ['reddit.com'],
  YELP: ['yelp.com'],
  TRIPADVISOR: ['tripadvisor.com'],
  LINKEDIN: ['linkedin.com'],
  YOUTUBE: ['youtube.com', 'youtu.be'],
  X: ['x.com', 'twitter.com'],
});

const normalizeText = (value) => (value || '').toString().trim();
const compact = (value) => normalizeText(value).toLowerCase();

const parseHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const stripTitleNoise = (title) => normalizeText(title)
  .split('|')[0]
  .split(' - ')[0]
  .replace(/\(@.*?\)/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const inferTargetSourceFromUrl = (url) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

  for (const [target, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return target;
  }

  return 'WEBSITE';
};

export const extractUsernameFromUrl = (url, targetSource) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  const parts = parsed.pathname.split('/').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  if (targetSource === 'LINKEDIN' && parts[0] === 'company') return parts[1] || null;
  if (targetSource === 'YOUTUBE' && ['c', 'channel', 'user', '@'].some((prefix) => parts[0]?.startsWith(prefix))) {
    return parts[0] === '@' ? parts[1] || null : parts[0].replace(/^@/, '');
  }
  if (['REDDIT', 'YELP', 'TRIPADVISOR'].includes(targetSource)) return null;
  return parts[0].replace(/^@/, '') || null;
};

export const inferBusinessNameFromTitle = (title) => stripTitleNoise(title) || null;

const includesAnyCampaignTerm = (haystack, campaign) => {
  const text = compact(haystack);
  const businessTypes = Array.isArray(campaign?.businessTypes) ? campaign.businessTypes : [];
  return businessTypes.some((type) => text.includes(compact(type)) || compact(type).includes(text));
};

export const calculateSerpEvidenceConfidence = ({ result, extractedFields, targetSource, campaign }) => {
  const titleAndSnippet = `${result?.title || ''} ${result?.snippet || ''}`;
  const inferredTarget = inferTargetSourceFromUrl(extractedFields?.platformUrl || result?.link);
  let score = 40;

  if (includesAnyCampaignTerm(titleAndSnippet, campaign)) score += 20;
  if (campaign?.city && compact(titleAndSnippet).includes(compact(campaign.city))) score += 8;
  if (campaign?.country && compact(titleAndSnippet).includes(compact(campaign.country))) score += 7;
  if (inferredTarget === targetSource) score += 15;
  if (extractedFields?.platformUsername || extractedFields?.businessName) score += 10;
  if (!campaign?.city && !campaign?.country) score -= 10;
  if (inferredTarget && inferredTarget !== targetSource && targetSource !== 'WEBSITE') score -= 15;

  return Math.max(0, Math.min(90, Math.round(score)));
};

export const normalizeSerpResult = ({ result, targetSource, campaign }) => {
  const parsed = parseHttpUrl(result?.link);
  if (!parsed) return null;

  const inferredTarget = inferTargetSourceFromUrl(parsed.href);
  const normalizedTarget = targetSource || inferredTarget || 'WEBSITE';
  const username = extractUsernameFromUrl(parsed.href, normalizedTarget);
  const title = normalizeText(result.title);
  const snippet = normalizeText(result.snippet);
  const businessName = inferBusinessNameFromTitle(title);
  const sourceUrl = parsed.href;
  const externalId = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);

  const extractedFields = {
    businessName,
    city: campaign?.city || null,
    country: campaign?.country || null,
    category: Array.isArray(campaign?.businessTypes) ? campaign.businessTypes[0] || null : null,
    platformUsername: username,
    platformUrl: sourceUrl,
    displayedLink: result.displayed_link || parsed.hostname,
    resultPosition: Number(result.position) || null,
  };

  const confidenceScore = calculateSerpEvidenceConfidence({
    result,
    extractedFields,
    targetSource: normalizedTarget,
    campaign,
  });

  return {
    targetSource: normalizedTarget,
    discoveryMethod: 'SERPAPI_DISCOVERY',
    sourceType: 'SERPAPI_ORGANIC_RESULT',
    sourceUrl,
    externalId,
    title,
    snippet,
    extractedFields,
    rawMetadata: {
      displayedLink: result.displayed_link || null,
      position: Number(result.position) || null,
      source: result.source || null,
    },
    confidenceScore,
  };
};
