import { env } from '../../config/env.js';

const TARGET_DOMAINS = Object.freeze({
  INSTAGRAM: 'instagram.com',
  TIKTOK: 'tiktok.com',
  FACEBOOK: 'facebook.com',
  REDDIT: 'reddit.com',
  YELP: 'yelp.com',
  TRIPADVISOR: 'tripadvisor.com',
  LINKEDIN: 'linkedin.com/company',
  YOUTUBE: 'youtube.com',
  X: 'x.com',
});

const normalize = (value) => (value || '').toString().trim();
const quote = (value) => `"${normalize(value).replace(/"/g, '')}"`;

const singularize = (value) => {
  const text = normalize(value);
  if (text.endsWith('ies')) return `${text.slice(0, -3)}y`;
  if (text.endsWith('es')) return text.slice(0, -2);
  if (text.endsWith('s') && text.length > 3) return text.slice(0, -1);
  return text;
};

const campaignTerms = (campaign = {}) => {
  const businessTypes = Array.isArray(campaign.businessTypes) ? campaign.businessTypes.filter(Boolean) : [];
  const businessType = businessTypes[0] || campaign.query || 'business';
  return {
    businessType,
    businessTypeSingular: singularize(businessType),
    city: campaign.city || '',
    country: campaign.country || '',
    serviceKeyword: campaign.serviceProfile?.serviceType || campaign.filters?.goal || campaign.query || businessType,
  };
};

const queryForTarget = (targetSource, campaign) => {
  const domain = TARGET_DOMAINS[targetSource];
  const terms = campaignTerms(campaign);
  if (!domain) {
    return [
      `${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)} instagram`,
      `${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)} menu`,
      `${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)} contact`,
    ];
  }

  if (targetSource === 'REDDIT') {
    return [
      `site:${domain} ${quote(terms.serviceKeyword)} "looking for" ${quote(terms.country)}`,
      `site:${domain}/r/forhire ${quote(terms.serviceKeyword)}`,
      `site:${domain} ${quote(terms.businessType)} ${quote(terms.city)}`,
    ];
  }

  if (targetSource === 'TIKTOK') {
    return [
      `site:${domain} ${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)}`,
      `site:${domain} "@*" ${quote(terms.businessType)} ${quote(terms.city)}`,
    ];
  }

  return [
    `site:${domain} ${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)}`,
    `site:${domain} ${quote(terms.businessTypeSingular)} ${quote(terms.city)}`,
  ];
};

export const buildSerpQueriesForCampaign = ({ campaign, targetSources = [], missingResultCount = 20 }) => {
  const maxQueries = Math.max(1, Math.min(
    Number(campaign?.filters?.budget?.maxSerpQueries) || env.SERPAPI_MAX_QUERIES_PER_CAMPAIGN,
    Math.max(1, missingResultCount),
  ));

  const queries = [];
  for (const targetSource of targetSources) {
    for (const query of queryForTarget(targetSource, campaign)) {
      const normalized = query.replace(/\s+/g, ' ').trim();
      if (normalized && !queries.includes(normalized)) queries.push(normalized);
      if (queries.length >= maxQueries) return queries;
    }
  }

  if (queries.length === 0) {
    const terms = campaignTerms(campaign);
    queries.push(`${quote(terms.businessType)} ${quote(terms.city)} ${quote(terms.country)} contact`);
  }

  return queries.slice(0, maxQueries);
};
