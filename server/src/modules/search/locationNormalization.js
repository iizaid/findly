const JORDAN_GOVERNORATES = [
  'Amman',
  'Zarqa',
  'Irbid',
  'Aqaba',
  'Balqa',
  'Madaba',
  'Karak',
  'Tafilah',
  'Maan',
  'Mafraq',
  'Jerash',
  'Ajloun',
];

const compactLocation = (value) => (value || '')
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/\s+/g, ' ');

const containsAny = (value, terms) => terms.some((term) => value.includes(term));

const governorateMatchers = [
  ['Amman', ['amman', 'عمان', 'sweifieh', 'swefieh', 'khalda', 'um uthaina', 'umm uthaina', 'abdoun', 'dabouq', 'tabarbour', 'luweibdeh', 'lweibdeh', 'shmeisani', 'jabal al lweibdeh', 'wasfi al-tal', 'wasfi al tal', 'madina al-monawara', 'madina al monawara', 'abdali', 'city mall', 'jubaiha', 'deir ghbar', '5th circle', 'fifth circle', '6th circle', '7th circle']],
  ['Zarqa', ['zarqa', 'الزرقاء']],
  ['Irbid', ['irbid', 'ramtha', 'اربد', 'إربد']],
  ['Aqaba', ['aqaba', 'ayla', 'العقبة']],
  ['Balqa', ['balqa', 'salt', 'السلط', 'البلقاء']],
  ['Madaba', ['madaba', 'مادبا']],
  ['Karak', ['karak', 'الكرك']],
  ['Tafilah', ['tafilah', 'tafila', 'الطفيلة']],
  ['Maan', ['maan', 'ma an', 'معان']],
  ['Mafraq', ['mafraq', 'المفرق']],
  ['Jerash', ['jerash', 'جرش']],
  ['Ajloun', ['ajloun', 'ajlun', 'عجلون']],
];

const jordanWideTerms = [
  'jordan-wide',
  'jordan wide',
  'multi-governorate',
  'multi governorate',
  'multiple branches',
  'online',
  'verify',
  'dm orders',
  'fast delivery',
  'delivery',
  'all jordan',
  'jordan + palestine',
];

export const normalizeCountry = (value) => {
  const normalized = compactLocation(value);
  if (!normalized) return null;
  if (normalized.includes('jordan') || normalized.includes('الاردن') || normalized.includes('الأردن')) return 'Jordan';
  return value.toString().trim().replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getSupportedJordanGovernorates = () => [...JORDAN_GOVERNORATES];

export const isJordanWideLocation = (value) => {
  const normalized = compactLocation(value);
  if (!normalized) return false;
  return containsAny(normalized, jordanWideTerms);
};

export const normalizeGovernorate = (value) => {
  const normalized = compactLocation(value);
  if (!normalized) return null;

  for (const [governorate, terms] of governorateMatchers) {
    if (containsAny(normalized, terms)) return governorate;
  }

  return null;
};

export const isNeighborhoodOrStreet = (value) => {
  const normalized = compactLocation(value);
  if (!normalized) return false;
  if (isJordanWideLocation(value)) return true;
  if (normalizeGovernorate(value) && !JORDAN_GOVERNORATES.map(compactLocation).includes(normalized)) return true;
  return /street|st\.?|circle|mall|village|corniche|hotel|branch|branches/.test(normalized);
};

export const normalizeJordanLocation = (value) => {
  const governorate = normalizeGovernorate(value);
  if (governorate) return governorate;
  if (isJordanWideLocation(value)) return 'Jordan-wide';
  return null;
};

export const mapRawLocationToGovernorate = (rawLocation) => normalizeGovernorate(rawLocation);

export const leadMatchesGovernorate = (lead, governorate) => {
  if (!governorate) return true;
  const normalizedTarget = normalizeGovernorate(governorate);
  if (!normalizedTarget) return false;

  const locationCandidates = [
    lead.city,
    lead.address,
    lead.country,
    lead.rawData?.city,
    lead.rawData?.City,
    lead.rawData?.location,
    lead.rawData?.Location,
    lead.rawData?.address,
    lead.rawData?.Address,
  ];

  return locationCandidates.some((value) => normalizeGovernorate(value) === normalizedTarget);
};
