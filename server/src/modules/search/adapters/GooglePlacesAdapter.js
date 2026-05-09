import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';
import { fetchJsonWithTimeout } from '../../../utils/httpClient.js';
import { buildProviderCacheKey, getProviderCache, setProviderCache } from '../providerCache.service.js';
import { logger } from '../../../utils/logger.js';

// Deterministic query expansion for better coverage
const expandQueries = (businessTypes, city, country) => {
  const types = Array.isArray(businessTypes) ? businessTypes : [businessTypes].filter(Boolean);
  const location = [city, country].filter(Boolean).join(', ');
  if (!location) return [];

  const queries = [];
  for (const type of types) {
    queries.push(`${type} in ${location}`);
  }
  // If only one type, generate a variation
  if (types.length === 1 && types[0]) {
    const singular = types[0].replace(/s$/, '');
    if (singular !== types[0]) {
      queries.push(`${singular} in ${location}`);
    }
  }
  return queries.length > 0 ? queries : [`businesses in ${location}`];
};

export class GooglePlacesAdapter extends BaseAdapter {
  static key = 'GOOGLE_MAPS';
  static label = 'Google Maps / Places';
  static description = 'Official Google Places API source for compliant local business discovery.';
  static requiresApiKey = true;
  static comingSoon = false;
  static estimatedUseCase = 'Find local businesses by query, category, city, and country.';

  static isConfigured() {
    return Boolean(env.GOOGLE_PLACES_API_KEY);
  }

  static estimateCost({ maxResults = env.SOURCE_MAX_RESULTS_DEFAULT } = {}) {
    const capped = Math.min(maxResults, env.SOURCE_MAX_RESULTS_HARD_LIMIT);
    return {
      baseCost: 5,
      perResultCost: 1,
      maxResults: capped,
      estimatedCredits: 5 + capped,
      warnings: this.isConfigured() ? [] : ['Google Places API key is not configured.'],
    };
  }

  constructor(campaign) {
    super(campaign);
    this.apiKey = env.GOOGLE_PLACES_API_KEY;
  }

  async run() {
    return this.search();
  }

  async search() {
    if (!this.apiKey) {
      throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Google Places source is not configured yet.', 400);
    }

    const { businessTypes, city, country, requestedLimit } = this.campaign;
    const queries = expandQueries(businessTypes, city, country);

    if (queries.length === 0) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Campaign requires business type or location to build query.', 400);
    }

    const allResults = [];
    const seenIds = new Set();
    const maxPerQuery = Math.min(requestedLimit || 20, 20);

    for (const query of queries) {
      if (allResults.length >= (requestedLimit || 20)) break;

      try {
        const results = await this.searchText(query, maxPerQuery);
        for (const r of results) {
          if (!seenIds.has(r.sourceId)) {
            seenIds.add(r.sourceId);
            allResults.push(r);
          }
        }
      } catch (error) {
        if (error instanceof AppError) throw error;
        logger.warn('source.google_places.query_failed', { query, message: error.message });
      }
    }

    return allResults.slice(0, requestedLimit || 20);
  }

  async searchText(query, maxResults) {
    const cacheKey = buildProviderCacheKey({
      source: this.constructor.key,
      query,
      location: [this.campaign.city, this.campaign.country].filter(Boolean).join(', '),
      filters: { maxResults },
    });
    const cached = getProviderCache(cacheKey);
    if (cached) return cached;

    const url = 'https://places.googleapis.com/v1/places:searchText';
    const requestBody = {
      textQuery: query,
      maxResultCount: Math.min(maxResults, 20),
    };

    const data = await fetchJsonWithTimeout(url, {
      method: 'POST',
      timeoutMs: env.SOURCE_REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryType,places.types,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.location',
      },
      body: JSON.stringify(requestBody),
    });
    const places = data.places || [];
    const normalized = places.map((p) => this.normalize(p));
    setProviderCache(cacheKey, normalized);
    return normalized;
  }

  normalize(place) {
    return {
      businessName: place.displayName?.text || 'Unknown Business',
      category: place.primaryType || (place.types && place.types[0]) || null,
      address: place.formattedAddress || null,
      phone: place.nationalPhoneNumber || null,
      websiteUrl: place.websiteUri || null,
      googleMapsUrl: place.googleMapsUri || null,
      rating: place.rating || null,
      reviewCount: place.userRatingCount || null,
      latitude: place.location?.latitude || null,
      longitude: place.location?.longitude || null,
      source: 'GOOGLE_MAPS',
      sourceId: place.id,
      rawData: place,
    };
  }
}
