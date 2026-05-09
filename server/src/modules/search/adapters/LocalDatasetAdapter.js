import { BaseAdapter } from './BaseAdapter.js';
import { prisma } from '../../../db/prisma.js';
import { getDatasetStatus } from '../../datasets/datasetPaths.js';
import { leadMatchesGovernorate, normalizeCountry, normalizeGovernorate } from '../locationNormalization.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET'];

const compact = (value) => (value || '').toString().trim().toLowerCase();
const includes = (value, query) => compact(value).includes(compact(query));
const signalSet = (lead) => new Set(Array.isArray(lead.detectedSignals) ? lead.detectedSignals : []);

const foodTerms = ['cafe', 'coffee', 'restaurant', 'food', 'bakery', 'dessert', 'menu', 'مطعم', 'كافيه', 'قهوة', 'حلويات'];
const bookingTerms = ['clinic', 'salon', 'gym', 'spa', 'doctor', 'dental', 'medical', 'fitness', 'عيادة', 'صالون', 'نادي'];

const categoryMatches = (lead, terms = []) => {
  const haystack = [lead.category, lead.businessName, lead.rawData?.Segment, lead.rawData?.Subcategory]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
};

const goalKey = (goal = '') => compact(goal);
const hasWebsite = (lead) => Boolean(lead.websiteUrl);
const hasInstagram = (lead) => Boolean(lead.instagramUrl || lead.instagramUsername || signalSet(lead).has('HAS_INSTAGRAM'));
const hasFacebook = (lead) => Boolean(lead.facebookUrl);
const hasContact = (lead) => {
  const signals = signalSet(lead);
  return Boolean(lead.phone || lead.whatsappNumber || lead.email || signals.has('HAS_PHONE') || signals.has('HAS_WHATSAPP'));
};

const matchesBusinessType = (lead, businessType) => {
  if (!businessType) return true;
  const terms = compact(businessType)
    .split(/[,\s/]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);
  if (!terms.length) return true;
  return terms.some((term) => includes(lead.category, term) || includes(lead.businessName, term));
};

const scoreLead = (lead, input) => {
  const signals = signalSet(lead);
  const goal = goalKey(input.searchGoal || input.filters?.goal);
  const requestedSource = compact(input.sourceRequested || input.filters?.sourceRequested);
  let score = 0;

  if (input.country && normalizeCountry(lead.country) === normalizeCountry(input.country)) score += 16;
  if (input.city && leadMatchesGovernorate(lead, input.city)) score += 18;
  if (matchesBusinessType(lead, input.targetBusinessType)) score += 18;
  if (hasInstagram(lead)) score += 8;
  if (hasContact(lead)) score += 7;
  if (!hasWebsite(lead) || signals.has('NO_WEBSITE') || signals.has('HAS_INSTAGRAM_NO_WEBSITE')) score += 12;
  if ((lead.rating || 0) >= 4.2) score += 6;
  if ((lead.reviewCount || 0) >= 50) score += 6;

  if (requestedSource === 'instagram') score += hasInstagram(lead) ? 24 : -12;
  if (requestedSource === 'facebook') score += hasFacebook(lead) ? 20 : 0;
  if (requestedSource === 'google_maps') score += lead.googleMapsUrl || lead.source === 'GOOGLE_MAPS_DATASET' ? 12 : 0;
  if (requestedSource === 'website') score += hasWebsite(lead) ? 14 : 0;

  if (goal.includes('without website')) {
    score += (!hasWebsite(lead) || signals.has('NO_WEBSITE')) ? 28 : -30;
  } else if (goal.includes('weak online') || goal.includes('weak digital')) {
    score += (!hasWebsite(lead) || signals.has('HAS_INSTAGRAM_NO_WEBSITE')) ? 20 : 2;
  } else if (goal.includes('strong social')) {
    score += (hasInstagram(lead) && !hasWebsite(lead)) ? 28 : -8;
  } else if (goal.includes('high ratings')) {
    score += ((lead.rating || 0) >= 4.2 && (lead.reviewCount || 0) >= 25 && !hasWebsite(lead)) ? 26 : -8;
  } else if (goal.includes('booking')) {
    score += categoryMatches(lead, bookingTerms) ? 24 : -12;
  } else if (goal.includes('digital menu')) {
    score += categoryMatches(lead, foodTerms) ? 26 : -12;
  } else if (goal.includes('contact info')) {
    score += hasContact(lead) ? 22 : -8;
  } else if (goal.includes('instagram-first')) {
    score += hasInstagram(lead) ? 28 : -12;
  } else {
    score += 8;
  }

  return score;
};

export class LocalDatasetAdapter extends BaseAdapter {
  static key = 'LOCAL_DATASET';
  static label = 'Local Dataset';
  static description = 'Import collected Excel/CSV business datasets into Findly without external API keys.';
  static requiresApiKey = false;
  static comingSoon = false;
  static estimatedUseCase = 'Use collected Instagram, Google Maps, and web business datasets as real stored leads.';

  static isConfigured() {
    return getDatasetStatus().configured;
  }

  static async getStoredLeadCount(where = {}) {
    return prisma.leadCatalog.count({
      where: {
        ...where,
        source: { in: datasetSources },
      },
    });
  }

  static getStatus() {
    const dataset = getDatasetStatus();
    return {
      key: this.key,
      label: this.label,
      description: this.description,
      status: dataset.available ? 'available' : 'not_configured',
      configured: dataset.configured,
      available: dataset.available,
      comingSoon: false,
      requiresApiKey: false,
      requiresApproval: false,
      reason: dataset.available
        ? 'Local Excel/CSV datasets can be imported into Findly.'
        : 'No Data/ or local data/ folder was found for local dataset imports.',
      estimatedUseCase: this.estimatedUseCase,
      fileCount: dataset.fileCount,
    };
  }

  static estimateCost() {
    return {
      source: this.key,
      baseCost: 0,
      perResultCost: 0,
      estimatedCredits: 0,
      warnings: ['Dataset import is free during local development. Analysis still uses normal analysis credits.'],
    };
  }

  async run() {
    return this.search({
      serviceOffered: this.context.serviceOffered,
      targetBusinessType: Array.isArray(this.campaign.businessTypes) ? this.campaign.businessTypes[0] : null,
      country: this.campaign.country,
      city: this.campaign.city,
      searchGoal: this.campaign.filters?.goal,
      sourceRequested: this.campaign.filters?.sourceRequested,
      maxResults: this.campaign.requestedLimit || 20,
      filters: this.campaign.filters || {},
    });
  }

  async search(input = {}) {
    const maxResults = Math.max(1, Math.min(Number(input.maxResults) || 20, 100));
    const businessTypes = [
      input.targetBusinessType,
      ...(Array.isArray(input.businessTypes) ? input.businessTypes : []),
    ].filter(Boolean);

    const where = {
      source: { in: datasetSources },
    };

    if (input.country) where.country = { contains: normalizeCountry(input.country) || input.country, mode: 'insensitive' };

    const candidates = await prisma.leadCatalog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const scored = candidates
      .filter((lead) => !input.city || leadMatchesGovernorate(lead, normalizeGovernorate(input.city) || input.city))
      .filter((lead) => businessTypes.length === 0 || businessTypes.some((type) => matchesBusinessType(lead, type)))
      .map((lead) => ({ lead, score: scoreLead(lead, { ...input, targetBusinessType: businessTypes[0] }) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scored.map(({ lead, score }) => ({
      ...lead,
      localDatasetScore: Math.min(100, Math.max(0, Math.round(score))),
    }));
  }
}
