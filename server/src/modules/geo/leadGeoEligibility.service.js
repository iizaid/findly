import { env } from '../../config/env.js';
import { GEO_STATUS, areValidCoordinates } from './geoValidation.service.js';

export const leadGeoSelect = {
  id: true,
  businessName: true,
  category: true,
  country: true,
  city: true,
  address: true,
  websiteUrl: true,
  latitude: true,
  longitude: true,
  geoStatus: true,
  geoSource: true,
  geoProvider: true,
  geoConfidence: true,
  geoAccuracy: true,
  geoAddressNormalized: true,
  geoResolvedAt: true,
  geoFailedAt: true,
  geoFailureReason: true,
  geoUpdatedAt: true,
  updatedAt: true,
  createdAt: true,
  source: true,
};

export const shouldSkipGeoEnrichment = (lead, forceRefresh = false) => {
  if (!lead || forceRefresh) return false;
  return (
    lead.geoStatus === GEO_STATUS.RESOLVED
    && Number.isFinite(lead.geoConfidence)
    && lead.geoConfidence >= env.GEO_MIN_CONFIDENCE_TO_MAP
    && areValidCoordinates(lead.latitude, lead.longitude)
  );
};

export const toGeoInput = (lead) => ({
  businessName: lead.businessName,
  address: lead.address,
  city: lead.city,
  country: lead.country,
  category: lead.category,
  websiteUrl: lead.websiteUrl,
  source: lead.source,
});
