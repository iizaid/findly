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
  if (!lead.geoStatus || lead.geoStatus === GEO_STATUS.NOT_RESOLVED) {
    if (lead.geoFailureReason === 'PROVIDER_NO_RESULT') return 'No provider found a reliable business match.';
    if (lead.geoFailureReason === 'INSUFFICIENT_LOCATION_DETAIL') return 'Not enough business location detail was available.';
    return 'Location needs enrichment.';
  }
  if (lead.geoStatus === GEO_STATUS.LOW_CONFIDENCE) return 'Coordinates were found, but confidence is below the map threshold.';
  if (lead.geoStatus === GEO_STATUS.AMBIGUOUS) return 'Location could not be verified confidently.';
  if (lead.geoStatus === GEO_STATUS.INVALID_COORDINATES) return 'No reliable coordinates found.';
  if (lead.geoStatus === GEO_STATUS.PROVIDER_UNAVAILABLE) return 'A location provider was unavailable during enrichment.';
  if (lead.geoStatus === GEO_STATUS.FAILED) {
    if (lead.geoFailureReason === 'PROVIDER_BAD_RESPONSE') return 'The location provider returned an invalid response.';
    if (lead.geoFailureReason === 'PROVIDER_RATE_LIMITED') return 'The location provider rate-limited this request.';
    if (lead.geoFailureReason === 'PROVIDER_TIMEOUT') return 'The location provider timed out.';
    if (lead.geoFailureReason === 'PROVIDER_NOT_CONFIGURED') return 'The location provider is not configured.';
    return 'No reliable coordinates found.';
  }
  return 'No reliable coordinates found.';
};

export const classifyGeoFailureReason = (lead) => {
  const reason = lead?.geoFailureReason || null;
  if (!reason && (!lead?.geoStatus || lead.geoStatus === GEO_STATUS.NOT_RESOLVED)) return 'UNRESOLVED';
  if (lead?.geoStatus === GEO_STATUS.LOW_CONFIDENCE) return 'LOW_CONFIDENCE';
  if (reason === 'PROVIDER_BAD_RESPONSE') return 'PROVIDER_BAD_RESPONSE';
  if (reason === 'PROVIDER_RATE_LIMITED') return 'PROVIDER_RATE_LIMITED';
  if (reason === 'PROVIDER_NO_RESULT') return 'PROVIDER_NO_RESULT';
  if (reason === 'PROVIDER_NOT_CONFIGURED') return 'PROVIDER_NOT_CONFIGURED';
  if (reason === 'PROVIDER_TIMEOUT') return 'PROVIDER_TIMEOUT';
  if (['INSUFFICIENT_LOCATION_DETAIL', 'CITY_ONLY_QUERY', 'COUNTRY_ONLY_QUERY', 'QUERY_TOO_SHORT'].includes(reason)) {
    return 'SKIPPED_INSUFFICIENT_INPUT';
  }
  if (lead?.geoStatus === GEO_STATUS.FAILED) return 'FAILED';
  return reason || 'UNRESOLVED';
};

export const isLeadMappable = (lead, minConfidence) => {
  if (!lead) return false;
  if (lead.geoStatus !== GEO_STATUS.RESOLVED) return false;
  if (!areValidCoordinates(lead.latitude, lead.longitude)) return false;
  if (!Number.isFinite(lead.geoConfidence) || lead.geoConfidence < minConfidence) return false;
  if (!isBusinessLevelAccuracy(lead.geoAccuracy)) return false;
  return true;
};
