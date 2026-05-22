const BUSINESS_ACCURACY = new Set(['business', 'poi', 'amenity', 'address', 'street']);

export const GEO_STATUS = {
  NOT_RESOLVED: 'NOT_RESOLVED',
  RESOLVED: 'RESOLVED',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  AMBIGUOUS: 'AMBIGUOUS',
  FAILED: 'FAILED',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
};

export const isValidCoordinate = (value, { min, max }) => (
  Number.isFinite(value)
  && value >= min
  && value <= max
);

export const areValidCoordinates = (latitude, longitude) => (
  isValidCoordinate(latitude, { min: -90, max: 90 })
  && isValidCoordinate(longitude, { min: -180, max: 180 })
  && !(latitude === 0 && longitude === 0)
);

export const normalizeGeoAccuracy = (value) => {
  if (!value) return 'unknown';
  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes('city')) return 'city';
  if (normalized.includes('country')) return 'country';
  if (normalized.includes('street')) return 'street';
  if (normalized.includes('address')) return 'address';
  if (normalized.includes('amenity')) return 'amenity';
  if (normalized.includes('poi')) return 'poi';
  if (normalized.includes('business')) return 'business';
  return normalized;
};

export const isBusinessLevelAccuracy = (accuracy) => BUSINESS_ACCURACY.has(normalizeGeoAccuracy(accuracy));

export const buildNotMappableReason = (lead) => {
  if (!lead) return 'No reliable coordinates found.';
  if (!lead.geoStatus || lead.geoStatus === GEO_STATUS.NOT_RESOLVED) return 'Location needs enrichment.';
  if (lead.geoStatus === GEO_STATUS.LOW_CONFIDENCE) return 'Coordinate confidence is too low.';
  if (lead.geoStatus === GEO_STATUS.AMBIGUOUS) return 'Location could not be verified.';
  if (lead.geoStatus === GEO_STATUS.INVALID_COORDINATES) return 'No reliable coordinates found.';
  if (lead.geoStatus === GEO_STATUS.PROVIDER_UNAVAILABLE) return 'Location needs enrichment.';
  if (lead.geoStatus === GEO_STATUS.FAILED) return 'No reliable coordinates found.';
  return 'No reliable coordinates found.';
};

export const isLeadMappable = (lead, minConfidence) => {
  if (!lead) return false;
  if (lead.geoStatus !== GEO_STATUS.RESOLVED) return false;
  if (!areValidCoordinates(lead.latitude, lead.longitude)) return false;
  if (!Number.isFinite(lead.geoConfidence) || lead.geoConfidence < minConfidence) return false;
  if (!isBusinessLevelAccuracy(lead.geoAccuracy)) return false;
  return true;
};
