import { BaseAdapter } from './BaseAdapter.js';
import { prisma } from '../../../db/prisma.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { getDatasetStatus } from '../../datasets/datasetPaths.js';
import { leadMatchesGovernorate, normalizeCountry, normalizeGovernorate } from '../locationNormalization.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN'];

const compact = (value) => (value || '').toString().trim().toLowerCase();
const normalizeSearchText = (value) => compact(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[’']/g, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const signalSet = (lead) => new Set(Array.isArray(lead.detectedSignals) ? lead.detectedSignals : []);

const businessTypeTaxonomy = {
  CAFES: [
    'cafe', 'cafes', 'coffee', 'coffee shop', 'coffeeshop', 'espresso', 'roastery', 'specialty coffee',
    'كافيه', 'كافيهات', 'قهوة', 'كوفي', 'كوفي شوب', 'مقهى', 'مقاهي',
  ],
  RESTAURANTS: [
    'restaurant', 'restaurants', 'resto', 'food', 'dining', 'kitchen', 'grill', 'burger', 'pizza', 'shawarma',
    'مطعم', 'مطاعم', 'اكل', 'أكل', 'مشاوي', 'شاورما', 'بيتزا',
  ],
  PERFUME_STORES: ['perfume', 'perfumes', 'fragrance', 'oud', 'عطر', 'عطور', 'برفان', 'عود'],
  COSMETICS_STORES: ['cosmetic', 'cosmetics', 'beauty', 'makeup', 'skin care', 'skincare', 'تجميل', 'مكياج', 'عناية'],
  CLOTHING_STORES: ['clothing', 'clothes', 'fashion', 'apparel', 'boutique', 'ملابس', 'ازياء', 'أزياء', 'بوتيك'],
  CLINICS: ['clinic', 'clinics', 'doctor', 'medical', 'healthcare', 'عيادة', 'عيادات', 'طبيب', 'طبية'],
  DENTAL_CLINICS: ['dental', 'dentist', 'orthodontic', 'اسنان', 'أسنان', 'طبيب اسنان'],
  SALONS: ['salon', 'salons', 'beauty salon', 'barber', 'hair', 'nails', 'صالون', 'حلاقة', 'شعر', 'اظافر', 'أظافر'],
  GYMS: ['gym', 'gyms', 'fitness', 'crossfit', 'trainer', 'نادي', 'جيم', 'لياقة', 'رياضة'],
  REAL_ESTATE: ['real estate', 'property', 'properties', 'broker', 'عقار', 'عقارات', 'اسكان', 'إسكان'],
  ELECTRONICS_STORES: ['electronics', 'mobile', 'phone', 'computer', 'laptop', 'devices', 'الكترونيات', 'إلكترونيات', 'موبايل', 'كمبيوتر'],
  HOME_SUPPLIES: ['home', 'furniture', 'decor', 'kitchenware', 'houseware', 'اثاث', 'أثاث', 'منزل', 'ديكور'],
  ELECTRICAL_SUPPLIES: ['electrical', 'lighting', 'electric', 'كهرباء', 'انارة', 'إنارة'],
  BAKERIES: ['bakery', 'bakeries', 'bread', 'pastry', 'مخبز', 'مخابز', 'خبز', 'معجنات'],
  DESSERT_SHOPS: ['dessert', 'desserts', 'sweets', 'cake', 'ice cream', 'حلويات', 'كيك', 'ايس كريم', 'آيس كريم'],
  CAR_SERVICES: ['car', 'auto', 'garage', 'mechanic', 'detailing', 'wash', 'سيارات', 'كراج', 'ميكانيك', 'غسيل سيارات'],
  HOTELS: ['hotel', 'hotels', 'resort', 'suites', 'فندق', 'فنادق', 'منتجع'],
  TRAVEL_AGENCIES: ['travel', 'tourism', 'tours', 'agency', 'سفر', 'سياحة', 'رحلات'],
};

const taxonomyKeysByAlias = new Map(
  Object.entries(businessTypeTaxonomy).flatMap(([key, terms]) => terms.map((term) => [normalizeSearchText(term), key]))
);

const singularizeTerm = (term) => {
  if (!term) return term;
  if (term.endsWith('ies') && term.length > 4) return `${term.slice(0, -3)}y`;
  if (term.endsWith('es') && term.length > 4) return term.slice(0, -2);
  if (term.endsWith('s') && term.length > 3) return term.slice(0, -1);
  return term;
};

const expandBusinessTypeTerms = (businessType) => {
  const normalized = normalizeSearchText(businessType);
  if (!normalized) return [];

  const terms = new Set([normalized, singularizeTerm(normalized)]);
  normalized
    .split(/[,/\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)
    .forEach((term) => {
      terms.add(term);
      terms.add(singularizeTerm(term));
    });

  const matchedTaxonomyKeys = new Set();
  for (const [alias, key] of taxonomyKeysByAlias.entries()) {
    if (normalized.includes(alias) || alias.includes(normalized) || normalized.includes(singularizeTerm(alias))) {
      matchedTaxonomyKeys.add(key);
    }
  }

  for (const key of matchedTaxonomyKeys) {
    businessTypeTaxonomy[key].forEach((term) => terms.add(normalizeSearchText(term)));
  }

  return [...terms].filter(Boolean);
};

const flattenRawDataValues = (rawData, depth = 0) => {
  if (!rawData || depth > 2) return [];
  if (typeof rawData === 'string' || typeof rawData === 'number') return [rawData.toString()];
  if (Array.isArray(rawData)) return rawData.flatMap((item) => flattenRawDataValues(item, depth + 1));
  if (typeof rawData === 'object') return Object.values(rawData).flatMap((value) => flattenRawDataValues(value, depth + 1));
  return [];
};

const leadSearchText = (lead) => normalizeSearchText([
  lead.businessName,
  lead.category,
  lead.city,
  lead.address,
  lead.source,
  lead.sourceFile,
  lead.instagramUsername,
  lead.instagramUrl,
  lead.facebookUrl,
  lead.googleMapsUrl,
  ...flattenRawDataValues(lead.rawData),
].filter(Boolean).join(' '));

const foodTerms = ['cafe', 'coffee', 'restaurant', 'food', 'bakery', 'dessert', 'menu', 'مطعم', 'كافيه', 'قهوة', 'حلويات'];
const bookingTerms = ['clinic', 'salon', 'gym', 'spa', 'doctor', 'dental', 'medical', 'fitness', 'عيادة', 'صالون', 'نادي'];

const categoryMatches = (lead, terms = []) => {
  const haystack = leadSearchText(lead);
  return terms.some((term) => haystack.includes(normalizeSearchText(term)));
};

const goalKey = (goal = '') => compact(goal);
const hasWebsite = (lead) => Boolean(lead.websiteUrl);
const hasInstagram = (lead) => {
  const signals = signalSet(lead);
  const raw = leadSearchText(lead);
  return Boolean(
    lead.instagramUrl
    || lead.instagramUsername
    || signals.has('HAS_INSTAGRAM')
    || signals.has('SOURCE_INSTAGRAM')
    || raw.includes('instagram')
  );
};
const hasFacebook = (lead) => {
  const signals = signalSet(lead);
  const raw = leadSearchText(lead);
  return Boolean(lead.facebookUrl || signals.has('HAS_FACEBOOK') || signals.has('SOURCE_FACEBOOK') || raw.includes('facebook'));
};
const hasContact = (lead) => {
  const signals = signalSet(lead);
  return Boolean(lead.phone || lead.whatsappNumber || lead.email || signals.has('HAS_PHONE') || signals.has('HAS_WHATSAPP'));
};

const catalogLeadSearchSelect = {
  id: true,
  businessName: true,
  category: true,
  country: true,
  city: true,
  address: true,
  phone: true,
  whatsappNumber: true,
  email: true,
  websiteUrl: true,
  websiteStatus: true,
  instagramUrl: true,
  instagramUsername: true,
  facebookUrl: true,
  googleMapsUrl: true,
  source: true,
  sourceId: true,
  rating: true,
  reviewCount: true,
  latitude: true,
  longitude: true,
  detectedSignals: true,
  enrichmentData: true,
  importedAt: true,
  createdAt: true,
  updatedAt: true,
};

const matchesBusinessType = (lead, businessType) => {
  if (!businessType) return true;
  const terms = expandBusinessTypeTerms(businessType);
  if (!terms.length) return true;
  const haystack = leadSearchText(lead);
  return terms.some((term) => haystack.includes(term));
};

const leadMatchesPlatform = (lead, platform) => {
  const sigs = signalSet(lead);
  const raw = leadSearchText(lead);
  switch (platform) {
    case 'INSTAGRAM': return hasInstagram(lead);
    case 'GOOGLE_MAPS': return Boolean(lead.googleMapsUrl || sigs.has('HAS_GOOGLE_MAPS') || sigs.has('SOURCE_GOOGLE_MAPS') || lead.source === 'GOOGLE_MAPS_DATASET' || raw.includes('google maps') || raw.includes('maps.google'));
    case 'FACEBOOK': return hasFacebook(lead);
    case 'WEBSITE': return hasWebsite(lead);
    case 'YOUTUBE': return raw.includes('youtube') || raw.includes('youtu.be');
    case 'LINKEDIN': return raw.includes('linkedin');
    case 'TIKTOK': return raw.includes('tiktok');
    case 'TRIPADVISOR': return raw.includes('tripadvisor');
    case 'YELP': return raw.includes('yelp');
    case 'X': return raw.includes('twitter') || raw.includes('x.com');
    default: return false;
  }
};

const scoreLead = (lead, input) => {
  const signals = signalSet(lead);
  const goal = goalKey(input.searchGoal || input.filters?.goal);
  const selectedPlatforms = input.platformsRequested || input.filters?.platformsRequested || [];
  const targetBusinessType = input.targetBusinessType;
  const businessTypeMatched = matchesBusinessType(lead, targetBusinessType);
  let score = 0;

  if (input.country && normalizeCountry(lead.country) === normalizeCountry(input.country)) score += 16;
  if (input.city && leadMatchesGovernorate(lead, input.city)) score += 20;
  if (targetBusinessType) score += businessTypeMatched ? 24 : -16;
  if (hasInstagram(lead)) score += 8;
  if (hasContact(lead)) score += 7;
  if (!hasWebsite(lead) || signals.has('NO_WEBSITE') || signals.has('HAS_INSTAGRAM_NO_WEBSITE')) score += 12;
  if ((lead.rating || 0) >= 4.2) score += 6;
  if ((lead.reviewCount || 0) >= 50) score += 6;

  const platformMatchCount = selectedPlatforms.filter((platform) => leadMatchesPlatform(lead, platform)).length;

  if (platformMatchCount > 0) score += 18 + platformMatchCount * 8;
  if (selectedPlatforms.length > 1 && platformMatchCount > 1) score += 10;
  if (platformMatchCount === 0 && selectedPlatforms.length > 0) score -= 10;

  if (goal.includes('without website')) {
    score += (!hasWebsite(lead) || signals.has('NO_WEBSITE')) ? 30 : -24;
  } else if (goal.includes('weak online') || goal.includes('weak digital')) {
    score += (!hasWebsite(lead) || signals.has('HAS_INSTAGRAM_NO_WEBSITE')) ? 22 : 2;
  } else if (goal.includes('strong social')) {
    score += (hasInstagram(lead) && !hasWebsite(lead)) ? 30 : -8;
  } else if (goal.includes('high ratings')) {
    score += ((lead.rating || 0) >= 4.2 && (lead.reviewCount || 0) >= 25 && !hasWebsite(lead)) ? 28 : -8;
  } else if (goal.includes('booking')) {
    score += categoryMatches(lead, bookingTerms) ? 24 : -10;
  } else if (goal.includes('digital menu')) {
    score += categoryMatches(lead, foodTerms) ? 28 : -10;
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
      businessTypes: this.campaign.businessTypes,
      country: this.campaign.country,
      city: this.campaign.city,
      searchGoal: this.campaign.filters?.goal,
      platformsRequested: this.campaign.filters?.platformsRequested,
      maxResults: this.campaign.requestedLimit || 20,
      filters: this.campaign.filters || {},
    });
  }

  async search(input = {}) {
    const maxResults = Math.max(1, Math.min(Number(input.maxResults) || 20, 100));
    const candidateLimit = Math.max(100, Math.min(Number(env.LOCAL_DATASET_CANDIDATE_LIMIT) || 1000, 10000));
    const startedAt = Date.now();
    const businessTypes = [
      input.targetBusinessType,
      ...(Array.isArray(input.businessTypes) ? input.businessTypes : []),
    ].filter(Boolean);

    const baseWhere = { source: { in: datasetSources } };
    const businessTypeTerms = [...new Set(businessTypes.flatMap(expandBusinessTypeTerms))]
      .filter((term) => term.length > 2)
      .slice(0, 12);
    const categoryWhere = businessTypeTerms.length
      ? {
          OR: businessTypeTerms.map((term) => ({
            category: { contains: term, mode: 'insensitive' },
          })),
        }
      : {};
    const countryWhere = input.country ? { country: { equals: normalizeCountry(input.country), mode: 'insensitive' } } : {};
    const cityWhere = input.city ? { city: { equals: normalizeGovernorate(input.city) || input.city, mode: 'insensitive' } } : {};

    const fetchCandidates = (where, take = candidateLimit) => prisma.leadCatalog.findMany({
      where,
      select: catalogLeadSearchSelect,
      orderBy: { createdAt: 'desc' },
      take,
    });

    let candidates = await fetchCandidates({
      ...baseWhere,
      ...countryWhere,
      ...cityWhere,
      ...categoryWhere,
    });

    if (candidates.length < maxResults && (input.city || businessTypeTerms.length)) {
      candidates = await fetchCandidates({
        ...baseWhere,
        ...countryWhere,
        ...categoryWhere,
      });
    }

    if (candidates.length < maxResults && input.country) {
      candidates = await fetchCandidates({
        ...baseWhere,
        ...countryWhere,
      });
    }

    if (candidates.length < maxResults) {
      candidates = await fetchCandidates(baseWhere);
    }

    const countryPool = input.country
      ? candidates.filter((lead) => normalizeCountry(lead.country) === normalizeCountry(input.country) || !lead.country)
      : candidates;
    const countryCandidates = countryPool.length > 0 ? countryPool : candidates;

    const locationPool = input.city
      ? countryCandidates.filter((lead) => leadMatchesGovernorate(lead, normalizeGovernorate(input.city) || input.city))
      : countryCandidates;
    const locationCandidates = locationPool.length > 0 ? locationPool : countryCandidates;

    const businessPool = businessTypes.length > 0
      ? locationCandidates.filter((lead) => businessTypes.some((type) => matchesBusinessType(lead, type)))
      : locationCandidates;
    const searchCandidates = businessPool.length > 0 ? businessPool : locationCandidates;

    const scored = searchCandidates
      .map((lead) => ({
        lead,
        score: scoreLead(lead, { ...input, targetBusinessType: businessTypes[0] }),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    logger.info('local_dataset.search.completed', {
      candidateCount: candidates.length,
      scoringPoolCount: searchCandidates.length,
      scoredCount: scored.length,
      resultCount: scored.length,
      durationMs: Date.now() - startedAt,
    });

    return scored.map(({ lead, score }) => ({
      ...lead,
      localDatasetScore: Math.min(100, Math.max(0, Math.round(score))),
    }));
  }
}
