import { describe, expect, it } from 'vitest';
import { buildGeoNormalization } from '../../src/modules/geo/geoQueryNormalizer.service.js';

describe('buildGeoNormalization', () => {
  it('rejects city-only marker attempts', () => {
    const result = buildGeoNormalization({ city: 'Amman' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('CITY_ONLY_QUERY');
  });

  it('rejects country-only marker attempts', () => {
    const result = buildGeoNormalization({ country: 'Jordan' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('COUNTRY_ONLY_QUERY');
  });

  it('builds a normalized cache key for a concrete business query', () => {
    const result = buildGeoNormalization({
      businessName: '  Specialty Roastery  ',
      address: '  12 Rainbow Street  ',
      city: ' Amman ',
      country: ' Jordan ',
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedQuery).toBe('Specialty Roastery, 12 Rainbow Street, Amman, Jordan');
    expect(result.cacheKey).toBe('specialty roastery, 12 rainbow street, amman, jordan');
    expect(result.providerCountryCode).toBe('jo');
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['Jordan', 'jo'],
    ['Saudi Arabia', 'sa'],
    ['United Arab Emirates', 'ae'],
    ['United States', 'us'],
    ['United Kingdom', 'gb'],
    ['Qatar', 'qa'],
    ['Kuwait', 'kw'],
    ['Bahrain', 'bh'],
    ['Oman', 'om'],
    ['Egypt', 'eg'],
    ['Lebanon', 'lb'],
    ['Iraq', 'iq'],
    ['Palestine', 'ps'],
    ['Turkey', 'tr'],
  ])('normalizes provider country code for %s', (country, expected) => {
    const result = buildGeoNormalization({
      businessName: 'Specialty Roastery',
      city: 'Amman',
      country,
    });

    expect(result.providerCountryCode).toBe(expected);
  });
});
