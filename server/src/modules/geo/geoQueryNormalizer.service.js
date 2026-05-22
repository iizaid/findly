import crypto from 'node:crypto';

const compact = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ');

const compactLower = (value) => compact(value).toLowerCase();

const cleanWebsiteUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim().startsWith('http') ? value : `https://${value}`);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const normalizeCountryForGeo = (value) => compact(value);
export const normalizeCityForGeo = (value) => compact(value);

export const buildGeoNormalization = (input = {}) => {
  const businessName = compact(input.businessName);
  const address = compact(input.address);
  const city = normalizeCityForGeo(input.city);
  const country = normalizeCountryForGeo(input.country);
  const category = compact(input.category);
  const websiteUrl = cleanWebsiteUrl(input.websiteUrl);

  const fragments = [businessName, address, city, country].filter(Boolean);
  const normalizedQuery = fragments.join(', ');
  const cacheKey = compactLower(normalizedQuery);
  const sourceHash = crypto.createHash('sha256').update(cacheKey).digest('hex');

  const hasBusiness = businessName.length >= 2;
  const hasAddress = address.length >= 5;
  const broadOnly = !hasAddress && !hasBusiness;
  const tooShort = cacheKey.length < 6;
  const cityOnly = Boolean(city) && !businessName && !address && !country;
  const countryOnly = Boolean(country) && !businessName && !address && !city;

  return {
    ok: !broadOnly && !tooShort && !cityOnly && !countryOnly,
    reason: cityOnly
      ? 'CITY_ONLY_QUERY'
      : countryOnly
        ? 'COUNTRY_ONLY_QUERY'
        : broadOnly
          ? 'INSUFFICIENT_LOCATION_DETAIL'
          : tooShort
            ? 'QUERY_TOO_SHORT'
            : null,
    businessName,
    address,
    city,
    country,
    category,
    websiteUrl,
    normalizedQuery,
    cacheKey,
    sourceHash,
  };
};
