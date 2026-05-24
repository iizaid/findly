import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getCachedGeoResult, saveGeoCacheResult } from './geoCache.service.js';
import { buildGeoNormalization } from './geoQueryNormalizer.service.js';
import { areValidCoordinates, GEO_STATUS, normalizeGeoAccuracy } from './geoValidation.service.js';
import { geoapifyGeocode } from './providers/geoapifyGeocoder.service.js';
import { locationIqGeocode } from './providers/locationIqGeocoder.service.js';

const PROVIDERS = {
  geoapify: geoapifyGeocode,
  locationiq: locationIqGeocode,
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const normalizeProviderConfidence = (value) => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= 1) return parsed * 100;
  if (parsed <= 100) return parsed;
  return 100;
};

export const scoreGeoCandidate = (candidate, input) => {
  let confidence = 0;
  const reasons = [];

  if (areValidCoordinates(candidate.latitude, candidate.longitude)) {
    confidence += 30;
    reasons.push('valid_coordinates');
  } else {
    return { confidence: 0, status: GEO_STATUS.INVALID_COORDINATES, reasons };
  }

  const accuracy = normalizeGeoAccuracy(candidate.accuracy);
  if (['amenity', 'poi', 'business', 'address', 'street'].includes(accuracy)) {
    confidence += 25;
    reasons.push('business_level_accuracy');
  }

  const businessName = normalizeText(input.businessName);
  const candidateName = normalizeText(candidate.businessName || candidate.normalizedAddress);
  if (businessName && candidateName && (candidateName.includes(businessName) || businessName.includes(candidateName))) {
    confidence += 20;
    reasons.push('business_name_match');
  }

  if (input.city && candidate.city && normalizeText(candidate.city).includes(normalizeText(input.city))) {
    confidence += 10;
    reasons.push('city_match');
  }

  if (input.country && candidate.country && normalizeText(candidate.country).includes(normalizeText(input.country))) {
    confidence += 10;
    reasons.push('country_match');
  }

  if (input.address && candidate.normalizedAddress && normalizeText(candidate.normalizedAddress).includes(normalizeText(input.address))) {
    confidence += 10;
    reasons.push('address_match');
  }

  const providerConfidenceScore = normalizeProviderConfidence(candidate.providerConfidence);
  if (providerConfidenceScore !== null && providerConfidenceScore >= 85) {
    confidence += 10;
    reasons.push('provider_confidence');
  }

  if (input.category && candidate.category && normalizeText(candidate.category).includes(normalizeText(input.category))) {
    confidence += 5;
    reasons.push('category_match');
  }

  if (accuracy === 'city') confidence = Math.min(confidence, 40);
  if (accuracy === 'country') confidence = 0;

  if (candidate.city && input.city && !normalizeText(candidate.city).includes(normalizeText(input.city))) {
    return { confidence: 0, status: GEO_STATUS.AMBIGUOUS, reasons: ['city_mismatch'] };
  }

  if (candidate.country && input.country && !normalizeText(candidate.country).includes(normalizeText(input.country))) {
    return { confidence: 0, status: GEO_STATUS.AMBIGUOUS, reasons: ['country_mismatch'] };
  }

  if (confidence >= env.GEO_MIN_CONFIDENCE_TO_MAP) return { confidence, status: GEO_STATUS.RESOLVED, reasons };
  if (confidence >= env.GEO_MIN_CONFIDENCE_TO_SAVE) return { confidence, status: GEO_STATUS.LOW_CONFIDENCE, reasons };
  return { confidence, status: GEO_STATUS.AMBIGUOUS, reasons };
};

const toNormalizedResult = (candidate, input, score, cacheHit = false) => ({
  ok: score.status === GEO_STATUS.RESOLVED || score.status === GEO_STATUS.LOW_CONFIDENCE,
  provider: candidate.provider,
  providerPlaceId: candidate.providerPlaceId,
  latitude: candidate.latitude,
  longitude: candidate.longitude,
  confidence: score.confidence,
  accuracy: normalizeGeoAccuracy(candidate.accuracy),
  resultType: candidate.resultType,
  normalizedAddress: candidate.normalizedAddress,
  city: candidate.city || input.city || null,
  country: candidate.country || input.country || null,
  rawQualitySummary: candidate.rawQualitySummary,
  cacheHit,
  geoStatus: score.status,
});

const executeProvider = async (providerKey, normalizedInput) => {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'Geo provider is not configured.', 500);
  }

  let attempts = 0;
  while (attempts <= env.GEO_PROVIDER_MAX_RETRIES) {
    try {
      return await provider(normalizedInput);
    } catch (error) {
      attempts += 1;
      if (attempts > env.GEO_PROVIDER_MAX_RETRIES) throw error;
    }
  }
  return [];
};

export const geocodeBusinessLocation = async (input, options = {}) => {
  const normalizedInput = buildGeoNormalization(input);
  if (!normalizedInput.ok) {
    return {
      ok: false,
      provider: null,
      reason: normalizedInput.reason,
      retryable: false,
      cacheHit: false,
      geoStatus: GEO_STATUS.NOT_RESOLVED,
    };
  }

  const cached = await getCachedGeoResult({ sourceHash: normalizedInput.sourceHash });
  if (cached) {
    return {
      ok: cached.confidence >= env.GEO_MIN_CONFIDENCE_TO_SAVE,
      provider: cached.provider,
      providerPlaceId: cached.providerPlaceId,
      latitude: cached.latitude,
      longitude: cached.longitude,
      confidence: cached.confidence,
      accuracy: normalizeGeoAccuracy(cached.accuracy),
      resultType: cached.resultType,
      normalizedAddress: cached.normalizedAddress,
      city: cached.normalizedCity,
      country: cached.normalizedCountry,
      rawQualitySummary: { cache: true },
      cacheHit: true,
      geoStatus: cached.confidence >= env.GEO_MIN_CONFIDENCE_TO_MAP ? GEO_STATUS.RESOLVED : GEO_STATUS.LOW_CONFIDENCE,
    };
  }

  const providerOrder = [env.GEO_PROVIDER_PRIMARY, env.GEO_PROVIDER_FALLBACK]
    .filter((provider, index, array) => provider && provider !== 'none' && array.indexOf(provider) === index);

  let bestResult = null;
  let lastError = null;

  for (const providerKey of providerOrder) {
    try {
      const candidates = await executeProvider(providerKey, normalizedInput);
      for (const candidate of candidates) {
        const score = scoreGeoCandidate(candidate, normalizedInput);
        const result = toNormalizedResult(candidate, normalizedInput, score, false);
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      }

      if (bestResult?.confidence >= env.GEO_MIN_CONFIDENCE_TO_MAP) {
        await saveGeoCacheResult({
          sourceHash: normalizedInput.sourceHash,
          normalizedQuery: normalizedInput.cacheKey,
          normalizedCountry: normalizedInput.country || null,
          normalizedCity: normalizedInput.city || null,
          provider: bestResult.provider,
          providerPlaceId: bestResult.providerPlaceId,
          latitude: bestResult.latitude,
          longitude: bestResult.longitude,
          confidence: bestResult.confidence,
          accuracy: bestResult.accuracy,
          resultType: bestResult.resultType,
          normalizedAddress: bestResult.normalizedAddress,
        });
        return bestResult;
      }
      if (bestResult?.geoStatus === GEO_STATUS.LOW_CONFIDENCE && bestResult.confidence >= env.GEO_MIN_CONFIDENCE_TO_SAVE) {
        await saveGeoCacheResult({
          sourceHash: normalizedInput.sourceHash,
          normalizedQuery: normalizedInput.cacheKey,
          normalizedCountry: normalizedInput.country || null,
          normalizedCity: normalizedInput.city || null,
          provider: bestResult.provider,
          providerPlaceId: bestResult.providerPlaceId,
          latitude: bestResult.latitude,
          longitude: bestResult.longitude,
          confidence: bestResult.confidence,
          accuracy: bestResult.accuracy,
          resultType: bestResult.resultType,
          normalizedAddress: bestResult.normalizedAddress,
        });
        return bestResult;
      }
    } catch (error) {
      lastError = error;
      logger.warn('geo.provider.failed', {
        provider: providerKey,
        errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
        providerStatusCode: error instanceof AppError ? error.details?.providerStatusCode || null : null,
        providerBody: error instanceof AppError ? error.details?.providerBody || null : null,
      });
    }
  }

  if (bestResult) {
    await saveGeoCacheResult({
      sourceHash: normalizedInput.sourceHash,
      normalizedQuery: normalizedInput.cacheKey,
      normalizedCountry: normalizedInput.country || null,
      normalizedCity: normalizedInput.city || null,
      provider: bestResult.provider,
      providerPlaceId: bestResult.providerPlaceId,
      latitude: bestResult.latitude,
      longitude: bestResult.longitude,
      confidence: bestResult.confidence,
      accuracy: bestResult.accuracy,
      resultType: bestResult.resultType,
      normalizedAddress: bestResult.normalizedAddress,
    });
    return bestResult;
  }

  if (lastError && !env.GEO_PROVIDER_FAIL_OPEN && !options.failOpen) {
    throw lastError;
  }

  return {
    ok: false,
    provider: providerOrder[0] || null,
    reason: lastError instanceof AppError ? lastError.code : 'PROVIDER_NO_RESULT',
    retryable: Boolean(lastError && [errorCodes.PROVIDER_TIMEOUT, errorCodes.PROVIDER_RATE_LIMITED, errorCodes.PROVIDER_UNAVAILABLE].includes(lastError.code)),
    cacheHit: false,
    geoStatus: lastError ? GEO_STATUS.FAILED : GEO_STATUS.NOT_RESOLVED,
  };
};
