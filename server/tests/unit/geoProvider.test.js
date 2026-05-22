import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCachedGeoResult = vi.fn();
const saveGeoCacheResult = vi.fn();
const geoapifyGeocode = vi.fn();
const locationIqGeocode = vi.fn();

vi.mock('../../src/modules/geo/geoCache.service.js', () => ({
  getCachedGeoResult,
  saveGeoCacheResult,
}));

vi.mock('../../src/modules/geo/providers/geoapifyGeocoder.service.js', () => ({
  geoapifyGeocode,
}));

vi.mock('../../src/modules/geo/providers/locationIqGeocoder.service.js', () => ({
  locationIqGeocode,
}));

let geocodeBusinessLocation;
let normalizeProviderConfidence;
let scoreGeoCandidate;

beforeEach(async () => {
  ({ geocodeBusinessLocation, normalizeProviderConfidence, scoreGeoCandidate } = await import('../../src/modules/geo/geoProvider.service.js'));
  getCachedGeoResult.mockReset();
  saveGeoCacheResult.mockReset();
  geoapifyGeocode.mockReset();
  locationIqGeocode.mockReset();
});

describe('geocodeBusinessLocation', () => {
  it('returns cached results before any provider call', async () => {
    getCachedGeoResult.mockResolvedValue({
      provider: 'geoapify',
      providerPlaceId: 'cached-1',
      latitude: 31.955,
      longitude: 35.945,
      confidence: 92,
      accuracy: 'business',
      resultType: 'amenity',
      normalizedAddress: 'Rainbow Street, Amman, Jordan',
      normalizedCity: 'Amman',
      normalizedCountry: 'Jordan',
    });

    const result = await geocodeBusinessLocation({
      businessName: 'Specialty Roastery',
      address: 'Rainbow Street',
      city: 'Amman',
      country: 'Jordan',
    });

    expect(result.cacheHit).toBe(true);
    expect(geoapifyGeocode).not.toHaveBeenCalled();
    expect(locationIqGeocode).not.toHaveBeenCalled();
  });

  it('falls back to the second provider when the primary provider fails', async () => {
    getCachedGeoResult.mockResolvedValue(null);
    geoapifyGeocode.mockRejectedValue(new Error('primary failed'));
    locationIqGeocode.mockResolvedValue([
      {
        provider: 'locationiq',
        providerPlaceId: 'loc-1',
        latitude: 31.955,
        longitude: 35.945,
        normalizedAddress: 'Rainbow Street, Amman, Jordan',
        resultType: 'address',
        accuracy: 'address',
        city: 'Amman',
        country: 'Jordan',
        businessName: 'Specialty Roastery',
        providerConfidence: 0.9,
        category: 'coffee shop',
        rawQualitySummary: { importance: 0.9 },
      },
    ]);

    const result = await geocodeBusinessLocation({
      businessName: 'Specialty Roastery',
      address: 'Rainbow Street',
      city: 'Amman',
      country: 'Jordan',
      category: 'coffee shop',
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('locationiq');
    expect(saveGeoCacheResult).toHaveBeenCalledTimes(1);
  });

  it('fails open with a safe reason when providers do not return a usable result', async () => {
    getCachedGeoResult.mockResolvedValue(null);
    geoapifyGeocode.mockResolvedValue([]);
    locationIqGeocode.mockResolvedValue([]);

    const result = await geocodeBusinessLocation({
      businessName: 'Specialty Roastery',
      address: 'Rainbow Street',
      city: 'Amman',
      country: 'Jordan',
    });

    expect(result.ok).toBe(false);
    expect(result.cacheHit).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('normalizeProviderConfidence', () => {
  it.each([
    [0.84, 84],
    [0.85, 85],
    [84, 84],
    [85, 85],
    ['0.9', 90],
    ['90', 90],
    [150, 100],
  ])('normalizes %p to %p', (value, expected) => {
    expect(normalizeProviderConfidence(value)).toBe(expected);
  });

  it.each([null, undefined, '', Number.NaN, -1, 'abc', Infinity])('returns null for invalid value %p', (value) => {
    expect(normalizeProviderConfidence(value)).toBeNull();
  });
});

describe('scoreGeoCandidate provider confidence boost', () => {
  const input = {
    businessName: 'Specialty Roastery',
    address: 'Rainbow Street',
    city: 'Amman',
    country: 'Jordan',
    category: 'coffee shop',
  };

  const baseCandidate = {
    latitude: 31.955,
    longitude: 35.945,
    normalizedAddress: 'Rainbow Street, Amman, Jordan',
    resultType: 'address',
    accuracy: 'address',
    city: 'Amman',
    country: 'Jordan',
    businessName: 'Specialty Roastery',
    category: 'coffee shop',
  };

  it.each([
    [0.84, false],
    [0.85, true],
    [84, false],
    [85, true],
    ['0.9', true],
    ['90', true],
    [null, false],
    [Number.NaN, false],
    ['abc', false],
  ])('marks provider_confidence for %p => %p', (providerConfidence, shouldBoost) => {
    const scored = scoreGeoCandidate({ ...baseCandidate, providerConfidence }, input);
    expect(scored.reasons.includes('provider_confidence')).toBe(shouldBoost);
  });
});
