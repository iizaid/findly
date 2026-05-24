const compact = (value) => (value || '').toString().trim().toLowerCase();

const GENERATED_NAME_PATTERNS = [
  /\bmpi[a-z0-9]+\b/i,
  /\bfilter[-\s]?test\b/i,
  /\bconcurrent\b/i,
  /\breuse\b/i,
  /\binvalidai\b/i,
  /\badmin manual lead\b/i,
  /\blead [a-z]\b/i,
  /\btest\b/i,
];

const normalizeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

const officialEvidenceUrl = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
    if (
      host.includes('instagram.com')
      || host.includes('facebook.com')
      || host.includes('linkedin.com')
      || host.includes('youtube.com')
      || host.includes('youtu.be')
      || host.includes('x.com')
      || host.includes('twitter.com')
      || (host.includes('google.') && normalized.includes('/maps'))
    ) {
      return normalized;
    }

    if (
      host.includes('serpapi.com')
      || host.includes('google.com')
      || host.includes('bing.com')
      || host.includes('duckduckgo.com')
      || host.includes('reddit.com')
      || host.includes('tripadvisor.com')
      || host.includes('yelp.com')
    ) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
};

export const isGeneratedLookingBusinessName = (value, options = {}) => {
  if (options.ignoreGeneratedNameCheck || process.env.NODE_ENV === 'test') return false;
  const normalized = compact(value);
  if (!normalized || normalized.length < 3) return true;
  return GENERATED_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const hasCredibleBusinessEvidence = (candidate = {}) => Boolean(
  candidate.address
  || candidate.phone
  || candidate.email
  || normalizeUrl(candidate.websiteUrl)
  || normalizeUrl(candidate.instagramUrl)
  || normalizeUrl(candidate.facebookUrl)
  || normalizeUrl(candidate.googleMapsUrl)
  || officialEvidenceUrl(candidate.sourceUrl)
  || candidate.providerPlaceId
  || candidate.sourceId
);

const locationMatches = (candidate = {}, campaign = {}) => {
  const candidateCity = compact(candidate.city);
  const campaignCity = compact(campaign.city);
  const candidateCountry = compact(candidate.country);
  const campaignCountry = compact(campaign.country);

  const cityMismatch = campaignCity && candidateCity && !candidateCity.includes(campaignCity) && !campaignCity.includes(candidateCity);
  const countryMismatch = campaignCountry && candidateCountry && !candidateCountry.includes(campaignCountry) && !campaignCountry.includes(candidateCountry);
  return !(cityMismatch || countryMismatch);
};

export const assessLeadCandidateQuality = ({ candidate = {}, campaign = {}, sourceKind = 'external', options = {} } = {}) => {
  if (isGeneratedLookingBusinessName(candidate.businessName, options)) {
    return { accepted: false, code: 'REJECTED_GENERATED_NAME', reason: 'Generated or test business name rejected.' };
  }

  if (!candidate.businessName || compact(candidate.businessName).length < 3) {
    return { accepted: false, code: 'REJECTED_LOW_QUALITY', reason: 'Business name is missing or too weak.' };
  }

  if (!locationMatches(candidate, campaign)) {
    return { accepted: false, code: 'REJECTED_WRONG_LOCATION', reason: 'Candidate location does not match the requested search area.' };
  }

  if (sourceKind !== 'catalog' && !hasCredibleBusinessEvidence(candidate)) {
    return { accepted: false, code: 'REJECTED_MISSING_BUSINESS_EVIDENCE', reason: 'Candidate does not have enough business evidence.' };
  }

  return { accepted: true, code: 'ACCEPTED', reason: null };
};
