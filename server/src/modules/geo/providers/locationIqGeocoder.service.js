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
      if (response.status === 404 && /unable to geocode/i.test(body)) {
        return [];
      }
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

export const locationIqGeocode = async ({ normalizedQuery, providerCountryCode }) => {
  if (!env.LOCATIONIQ_API_KEY) {
    throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'LocationIQ is not configured.', 500);
  }

  const params = new URLSearchParams({
    key: env.LOCATIONIQ_API_KEY,
    q: normalizedQuery,
    format: 'json',
    limit: '3',
    addressdetails: '1',
    normalizeaddress: '1',
  });

  if (providerCountryCode) {
    params.set('countrycodes', providerCountryCode);
  }

  const url = `${env.LOCATIONIQ_BASE_URL}?${params.toString()}`;
  const payload = await fetchJson(url, env.LOCATIONIQ_TIMEOUT_MS);
  const results = Array.isArray(payload) ? payload : [];

  return results.map((item) => ({
    provider: 'locationiq',
    providerPlaceId: item.place_id ? String(item.place_id) : null,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    normalizedAddress: item.display_name || null,
    resultType: item.type || item.class || null,
    accuracy: item.type || item.class || null,
    city: item.address?.city || item.address?.town || item.address?.state_district || null,
    country: item.address?.country || null,
    businessName: item.display_place || item.name || null,
    providerConfidence: Number(item.importance || 0),
    providerCityConfidence: Number(item.matchquality?.city || 0),
    providerStreetConfidence: Number(item.matchquality?.street || 0),
    category: item.type || null,
    rawQualitySummary: {
      importance: Number(item.importance || 0),
      type: item.type || null,
    },
  }));
};
