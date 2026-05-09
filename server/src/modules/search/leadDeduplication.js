const compact = (value) => (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeBusinessName = (value) => compact(value)
  .replace(/[^\p{L}\p{N}\s]/gu, '')
  .replace(/\b(co|company|llc|ltd|inc|restaurant|cafe)\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizePhone = (value) => {
  const digits = (value || '').toString().replace(/[^\d+]/g, '');
  return digits.length >= 7 ? digits : null;
};

export const normalizeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return `${hostname}${parsed.pathname === '/' ? '' : parsed.pathname.toLowerCase()}`;
  } catch {
    return null;
  }
};

export const normalizeInstagramUsername = (value) => (value || '')
  .toString()
  .trim()
  .replace(/^@/, '')
  .toLowerCase() || null;

export const normalizeAddress = (value) => compact(value)
  .replace(/[^\p{L}\p{N}\s]/gu, '')
  .replace(/\s+/g, ' ')
  .trim();

export const buildLeadFingerprint = (lead) => ({
  sourceKey: lead.source && lead.sourceId ? `${lead.source}:${lead.sourceId}` : null,
  websiteKey: normalizeUrl(lead.websiteUrl),
  phoneKey: normalizePhone(lead.phone),
  instagramKey: normalizeInstagramUsername(lead.instagramUsername)
    || normalizeInstagramUsername(lead.instagramUrl?.split('/').filter(Boolean).pop()),
  datasetKey: lead.normalizedFingerprint || null,
  nameCityKey: normalizeBusinessName(lead.businessName) && compact(lead.city)
    ? `${normalizeBusinessName(lead.businessName)}:${compact(lead.city)}`
    : null,
  addressKey: normalizeAddress(lead.address) && compact(lead.city)
    ? `${normalizeAddress(lead.address)}:${compact(lead.city)}`
    : null,
});

export const findDuplicateLead = async ({ tx, workspaceId, lead }) => {
  const fingerprint = buildLeadFingerprint(lead);
  const or = [];

  if (lead.source && lead.sourceId) {
    or.push({ source: lead.source, sourceId: lead.sourceId });
  }

  if (lead.normalizedFingerprint) {
    or.push({ normalizedFingerprint: lead.normalizedFingerprint });
  }

  if (lead.instagramUsername) {
    or.push({ instagramUsername: { equals: lead.instagramUsername, mode: 'insensitive' } });
  }

  if (lead.websiteUrl) {
    const websiteKey = fingerprint.websiteKey;
    if (websiteKey) {
      or.push({ websiteUrl: { contains: websiteKey.split('/')[0], mode: 'insensitive' } });
    }
  }

  if (fingerprint.phoneKey) {
    or.push({ phone: { contains: fingerprint.phoneKey.slice(-7) } });
  }

  const normalizedName = normalizeBusinessName(lead.businessName);
  if (normalizedName && lead.city) {
    or.push({
      businessName: { contains: normalizedName.split(' ')[0], mode: 'insensitive' },
      city: { equals: lead.city, mode: 'insensitive' },
    });
  }

  if (or.length === 0) return null;

  const candidates = await tx.lead.findMany({
    where: {
      workspaceId,
      OR: or,
    },
    take: 20,
  });

  return candidates.find((candidate) => {
    const candidateFingerprint = buildLeadFingerprint(candidate);
    return Boolean(
      (fingerprint.sourceKey && fingerprint.sourceKey === candidateFingerprint.sourceKey)
      || (fingerprint.datasetKey && fingerprint.datasetKey === candidateFingerprint.datasetKey)
      || (fingerprint.instagramKey && fingerprint.instagramKey === candidateFingerprint.instagramKey)
      || (fingerprint.websiteKey && fingerprint.websiteKey === candidateFingerprint.websiteKey)
      || (fingerprint.phoneKey && fingerprint.phoneKey === candidateFingerprint.phoneKey)
      || (fingerprint.nameCityKey && fingerprint.nameCityKey === candidateFingerprint.nameCityKey)
      || (fingerprint.addressKey && fingerprint.addressKey === candidateFingerprint.addressKey)
    );
  }) || null;
};
