import { env } from '../../../config/env.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

const fetchJson = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FindlyGeo/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 429) {
        throw new AppError(errorCodes.PROVIDER_RATE_LIMITED, 'Geo provider rate limited.', 429, {
          providerStatusCode: response.status,
          providerBody: body.slice(0, 240),
        });
      }
      throw new AppError(errorCodes.PROVIDER_BAD_RESPONSE, 'Geo provider returned a bad response.', 502, {
        providerStatusCode: response.status,
        providerBody: body.slice(0, 240),
      });
    }
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(errorCodes.PROVIDER_TIMEOUT, 'Geo provider timed out.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const geoapifyGeocode = async ({ normalizedQuery, country: _country, providerCountryCode }) => {
  if (!env.GEOAPIFY_API_KEY) {
    throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'Geoapify is not configured.', 500);
  }

  const params = new URLSearchParams({
    text: normalizedQuery,
    format: 'json',
    limit: '3',
    apiKey: env.GEOAPIFY_API_KEY,
  });

  if (providerCountryCode) {
    params.set('filter', `countrycode:${providerCountryCode}`);
  }

  const url = `${env.GEOAPIFY_BASE_URL}?${params.toString()}`;
  const payload = await fetchJson(url, env.GEOAPIFY_TIMEOUT_MS);
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results.map((item) => ({
    provider: 'geoapify',
    providerPlaceId: item.place_id ? String(item.place_id) : null,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    normalizedAddress: item.formatted || null,
    resultType: item.result_type || null,
    accuracy: item.result_type || null,
    city: item.city || item.county || null,
    country: item.country || null,
    businessName: item.name || null,
    providerConfidence: Number(item.rank?.confidence || 0),
    providerCityConfidence: Number(item.rank?.confidence_city_level || 0),
    providerStreetConfidence: Number(item.rank?.confidence_street_level || 0),
    category: item.categories?.[0] || null,
    rawQualitySummary: {
      matchType: item.rank?.match_type || null,
      confidence: Number(item.rank?.confidence || 0),
    },
  }));
};
