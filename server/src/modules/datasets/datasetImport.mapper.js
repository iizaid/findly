import crypto from 'node:crypto';

const emptyToNull = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const normalizeHeader = (header) => emptyToNull(header)
  ?.toLowerCase()
  .replace(/[_/\\.-]+/g, ' ')
  .replace(/[^\p{L}\p{N}\s]+/gu, '')
  .replace(/\s+/g, ' ')
  .trim() || '';

const aliases = {
  businessName: [
    'business name', 'businessname', 'business', 'name', 'brand', 'brand name', 'account name',
    'instagram name', 'page name', 'company', 'place name', 'placename', 'title', 'business_name',
  ],
  instagramUrl: ['instagram', 'instagram url', 'profile url', 'instagram link', 'ig url'],
  instagramUsername: ['username', 'handle', 'instagram handle', 'ig handle', 'account', 'instagram username', 'instagramusername'],
  websiteUrl: ['website', 'website url', 'existing website', 'existing website link', 'url', 'domain', 'web'],
  country: ['country', 'market'],
  city: ['city', 'city area', 'city / area', 'area', 'governorate', 'location'],
  address: ['address', 'full address', 'formatted address', 'formattedaddress', 'formatted_address', 'maps address'],
  category: ['category', 'business type', 'business_type', 'type', 'niche', 'industry', 'segment', 'apparel type'],
  phone: ['phone', 'phone number', 'phonenumber', 'phone_number', 'mobile', 'telephone'],
  whatsappNumber: ['whatsapp', 'whatsapp number', 'wa', 'public contact clue'],
  email: ['email', 'mail', 'contact email'],
  googleMapsUrl: ['google maps url', 'googlemapsurl', 'google maps search url', 'maps url', 'google maps', 'map url', 'place url', 'placeurl'],
  facebookUrl: ['facebook', 'facebook url', 'facebook link'],
  rating: ['rating', 'google rating', 'stars'],
  reviewCount: ['reviews', 'review count', 'reviewcount', 'google reviews', 'reviews count'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon'],
  notes: ['notes', 'description', 'bio', 'source note', 'why this lead fits', 'outreach angle', 'next step'],
  source: ['source'],
  sourceUrl: ['source url', 'sourceurl', 'source link'],
  status: ['status', 'outreach status', 'lead status'],
};

const aliasLookup = new Map(
  Object.entries(aliases).flatMap(([field, values]) => values.map((alias) => [normalizeHeader(alias), field])),
);

export const mapColumns = (headers = []) => {
  const mapping = {};
  const unmappedHeaders = [];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    const field = aliasLookup.get(normalized);
    if (field && mapping[field] === undefined) {
      mapping[field] = index;
    } else {
      unmappedHeaders.push(header);
    }
  });

  return { mapping, unmappedHeaders };
};

export const normalizeBusinessName = (value) => emptyToNull(value)
  ?.replace(/\s+/g, ' ')
  .trim() || null;

export const normalizeBusinessKey = (value) => normalizeBusinessName(value)
  ?.toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, '')
  .replace(/\b(co|company|llc|ltd|inc|restaurant|cafe)\b/g, '')
  .replace(/\s+/g, ' ')
  .trim() || null;

export const normalizePhone = (value) => {
  const text = emptyToNull(value);
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, '');
  return digits.replace(/(?!^)\+/g, '').length >= 7 ? digits : null;
};

export const normalizeUrlForStorage = (value) => {
  const text = emptyToNull(value);
  if (!text) return null;
  if (/^(javascript|data|file|vbscript):/i.test(text)) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

export const normalizeUrlKey = (value) => {
  const url = normalizeUrlForStorage(value);
  if (!url) return null;
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${parsed.pathname === '/' ? '' : parsed.pathname.toLowerCase()}`;
};

export const normalizeInstagram = (value) => {
  const text = emptyToNull(value);
  if (!text) return { instagramUrl: null, instagramUsername: null };

  const url = normalizeUrlForStorage(text.includes('instagram.com') ? text : `https://instagram.com/${text.replace(/^@/, '')}`);
  let username = null;

  if (url) {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().includes('instagram.com')) {
      username = parsed.pathname.split('/').filter(Boolean)[0] || null;
    }
  }

  if (!username && /^@?[\w.]+$/.test(text)) {
    username = text.replace(/^@/, '');
  }

  username = username?.replace(/^@/, '').toLowerCase() || null;
  return {
    instagramUrl: username ? `https://www.instagram.com/${username}/` : url,
    instagramUsername: username,
  };
};

const parseNumber = (value) => {
  const text = emptyToNull(value);
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const getMappedValue = (row, mapping, field) => {
  const index = mapping[field];
  return index === undefined ? null : emptyToNull(row[index]);
};

export const detectSourceType = ({ fileName = '', normalized }) => {
  const name = fileName.toLowerCase();
  if (normalized.googleMapsUrl || name.includes('google') || name.includes('maps')) return 'GOOGLE_MAPS_DATASET';
  if (normalized.instagramUrl || normalized.instagramUsername || name.includes('instagram')) return 'INSTAGRAM_DATASET';
  return 'LOCAL_DATASET';
};

export const buildDetectedSignals = (lead) => {
  const signals = new Set(['DATASET_IMPORTED', 'LOCAL_BUSINESS']);
  if (lead.instagramUrl || lead.instagramUsername) {
    signals.add('HAS_INSTAGRAM');
    signals.add('SOURCE_INSTAGRAM');
  }
  if (lead.googleMapsUrl) {
    signals.add('HAS_GOOGLE_MAPS');
    signals.add('SOURCE_GOOGLE_MAPS');
  }
  if (lead.websiteUrl) signals.add('HAS_WEBSITE');
  else signals.add('NO_WEBSITE');
  if ((lead.instagramUrl || lead.instagramUsername) && !lead.websiteUrl) signals.add('HAS_INSTAGRAM_NO_WEBSITE');
  if (lead.phone) signals.add('HAS_PHONE');
  if (lead.whatsappNumber) signals.add('HAS_WHATSAPP');
  if (lead.rating !== null && lead.rating !== undefined) signals.add('HAS_RATING');
  if (lead.rating >= 4.2) signals.add('HIGH_RATING');
  if (lead.reviewCount !== null && lead.reviewCount !== undefined) signals.add('HAS_REVIEWS');
  if (lead.reviewCount >= 50) signals.add('HIGH_REVIEW_COUNT');
  return [...signals];
};

export const buildLeadFingerprint = (lead) => {
  const parts = [
    lead.instagramUsername ? `ig:${lead.instagramUsername}` : null,
    lead.websiteUrl ? `web:${normalizeUrlKey(lead.websiteUrl)}` : null,
    lead.phone ? `phone:${normalizePhone(lead.phone)}` : null,
    lead.googleMapsUrl ? `maps:${lead.googleMapsUrl.toLowerCase().replace(/\/+$/, '')}` : null,
    lead.businessName && lead.city ? `namecity:${normalizeBusinessKey(lead.businessName)}:${lead.city.toLowerCase()}` : null,
  ].filter(Boolean);

  if (!parts.length) return null;
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
};

export const buildDatasetDedupeKeys = (lead) => [
  lead.instagramUsername ? `ig:${lead.instagramUsername}` : null,
  lead.instagramUrl ? `igurl:${normalizeUrlKey(lead.instagramUrl)}` : null,
  lead.websiteUrl ? `web:${normalizeUrlKey(lead.websiteUrl)}` : null,
  lead.phone ? `phone:${normalizePhone(lead.phone)}` : null,
  lead.whatsappNumber ? `whatsapp:${normalizePhone(lead.whatsappNumber)}` : null,
  lead.googleMapsUrl ? `maps:${lead.googleMapsUrl.toLowerCase().replace(/\/+$/, '')}` : null,
  lead.sourceId ? `source:${lead.source}:${lead.sourceId}` : null,
  lead.businessName && lead.city ? `namecity:${normalizeBusinessKey(lead.businessName)}:${lead.city.toLowerCase()}` : null,
  lead.address && lead.city ? `addresscity:${lead.address.toLowerCase()}:${lead.city.toLowerCase()}` : null,
].filter(Boolean);

const hasUsefulIdentifier = (lead) => Boolean(
  lead.businessName
  || lead.instagramUrl
  || lead.instagramUsername
  || lead.websiteUrl
  || lead.phone
  || lead.whatsappNumber
  || lead.email
  || lead.googleMapsUrl
  || lead.sourceId,
);

export const normalizeDatasetRow = ({ row, headers, mapping, fileName, sheetName, rowNumber }) => {
  const rawData = Object.fromEntries(Array.from(
    { length: headers.length },
    (_, index) => [headers[index] || `column_${index + 1}`, row[index] ?? null],
  ));
  const instagramFromUrl = normalizeInstagram(getMappedValue(row, mapping, 'instagramUrl'));
  const instagramFromUser = normalizeInstagram(getMappedValue(row, mapping, 'instagramUsername'));
  const instagram = instagramFromUrl.instagramUsername ? instagramFromUrl : instagramFromUser;

  const websiteUrl = normalizeUrlForStorage(getMappedValue(row, mapping, 'websiteUrl'));
  const googleMapsUrl = normalizeUrlForStorage(getMappedValue(row, mapping, 'googleMapsUrl'));
  const facebookUrl = normalizeUrlForStorage(getMappedValue(row, mapping, 'facebookUrl'));
  const phone = normalizePhone(getMappedValue(row, mapping, 'phone'));
  const whatsappNumber = normalizePhone(getMappedValue(row, mapping, 'whatsappNumber'));

  const businessName = normalizeBusinessName(getMappedValue(row, mapping, 'businessName'));
  const normalized = {
    businessName: businessName || instagram.instagramUsername || websiteUrl || googleMapsUrl || 'Unnamed imported lead',
    category: emptyToNull(getMappedValue(row, mapping, 'category')),
    country: emptyToNull(getMappedValue(row, mapping, 'country')) || (fileName.toLowerCase().includes('jordan') ? 'Jordan' : null),
    city: emptyToNull(getMappedValue(row, mapping, 'city')),
    address: emptyToNull(getMappedValue(row, mapping, 'address')),
    phone,
    whatsappNumber,
    email: emptyToNull(getMappedValue(row, mapping, 'email'))?.toLowerCase() || null,
    websiteUrl,
    instagramUrl: instagram.instagramUrl,
    instagramUsername: instagram.instagramUsername,
    facebookUrl,
    googleMapsUrl,
    rating: parseNumber(getMappedValue(row, mapping, 'rating')),
    reviewCount: parseNumber(getMappedValue(row, mapping, 'reviewCount')) ? Math.round(parseNumber(getMappedValue(row, mapping, 'reviewCount'))) : null,
    latitude: parseNumber(getMappedValue(row, mapping, 'latitude')),
    longitude: parseNumber(getMappedValue(row, mapping, 'longitude')),
    sourceId: instagram.instagramUsername || normalizeUrlKey(websiteUrl) || normalizePhone(phone) || (googleMapsUrl ? googleMapsUrl.toLowerCase() : null),
    rawData: {
      ...rawData,
      _dataset: {
        fileName,
        sheetName,
        rowNumber,
      },
    },
  };

  normalized.source = detectSourceType({ fileName, normalized });
  normalized.detectedSignals = buildDetectedSignals(normalized);
  normalized.normalizedFingerprint = buildLeadFingerprint(normalized);

  if (!hasUsefulIdentifier({ ...normalized, businessName })) {
    return {
      status: 'SKIPPED',
      errorMessage: 'Row does not contain a useful lead identifier.',
      rawData: normalized.rawData,
      normalizedData: normalized,
    };
  }

  return {
    status: 'READY',
    rawData: normalized.rawData,
    normalizedData: normalized,
  };
};
