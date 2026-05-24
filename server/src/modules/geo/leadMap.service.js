import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { leadGeoSelect } from './leadGeoEligibility.service.js';
import { buildNotMappableReason, classifyGeoFailureReason, isLeadMappable } from './geoValidation.service.js';

const analysisSelect = {
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: {
    opportunityScore: true,
    scoreLevel: true,
    suggestedService: true,
  },
};

const mapDirectLeadSelect = {
  ...leadGeoSelect,
  rating: true,
  reviewCount: true,
  phone: true,
  source: true,
  analyses: analysisSelect,
};

const mapCatalogLeadSelect = {
  ...leadGeoSelect,
  rating: true,
  reviewCount: true,
  phone: true,
  source: true,
};

const buildMappableLead = (lead, type) => ({
  id: lead.id,
  businessName: lead.businessName,
  latitude: lead.latitude,
  longitude: lead.longitude,
  geoConfidence: lead.geoConfidence,
  geoSource: lead.geoSource,
  geoProvider: lead.geoProvider,
  geoAccuracy: lead.geoAccuracy,
  city: lead.city,
  country: lead.country,
  category: lead.category,
  websiteUrl: lead.websiteUrl,
  phone: lead.phone,
  score: lead.analyses?.[0]?.opportunityScore ?? null,
  scoreLevel: lead.analyses?.[0]?.scoreLevel ?? null,
  updatedAt: lead.geoUpdatedAt || lead.updatedAt,
  recordType: type,
});

const buildNotMappableLead = (lead, type) => ({
  id: lead.id,
  businessName: lead.businessName,
  reason: buildNotMappableReason(lead),
  reasonCode: classifyGeoFailureReason(lead),
  canEnrich: true,
  city: lead.city,
  country: lead.country,
  category: lead.category,
  geoStatus: lead.geoStatus,
  geoFailureReason: lead.geoFailureReason,
  geoProvider: lead.geoProvider,
  geoConfidence: lead.geoConfidence,
  geoAccuracy: lead.geoAccuracy,
  recordType: type,
});

export const getLeadMapData = async ({ userId, leadIds = [], listId = null }) => {
  const dedupedLeadIds = [...new Set((leadIds || []).filter(Boolean))];
  if (!dedupedLeadIds.length && !listId) {
    return {
      mappable: [],
      notMappable: [],
      summary: {
        requestedCount: 0,
        accessibleCount: 0,
        mappableCount: 0,
        notMappableCount: 0,
        minConfidenceToMap: env.GEO_MIN_CONFIDENCE_TO_MAP,
      },
    };
  }

  if (dedupedLeadIds.length > 100) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Lead map accepts up to 100 selected leads at a time.', 400);
  }

  const [directLeads, listItems] = await Promise.all([
    (dedupedLeadIds.length
      ? prisma.lead.findMany({
        where: {
          userId,
          id: { in: dedupedLeadIds },
        },
        select: mapDirectLeadSelect,
      })
      : Promise.resolve([])),
    prisma.leadListLead.findMany({
      where: {
        leadList: {
          userId,
          ...(listId ? { id: listId } : {}),
        },
        ...(dedupedLeadIds.length ? {
          OR: [
            { catalogLeadId: { in: dedupedLeadIds } },
            { leadId: { in: dedupedLeadIds } },
          ],
        } : {}),
      },
      select: {
        id: true,
        leadId: true,
        catalogLeadId: true,
        analyses: analysisSelect,
        lead: { select: mapDirectLeadSelect },
        catalogLead: { select: mapCatalogLeadSelect },
      },
    }),
  ]);

  const catalogMap = new Map();
  const directMap = new Map(directLeads.map((lead) => [lead.id, lead]));
  for (const item of listItems) {
    if (item.catalogLead && !catalogMap.has(item.catalogLead.id)) {
      catalogMap.set(item.catalogLead.id, {
        ...item.catalogLead,
        analyses: item.analyses || [],
      });
    }
    if (item.lead && !directMap.has(item.lead.id)) {
      directMap.set(item.lead.id, item.lead);
    }
  }

  const accessible = [
    ...[...directMap.values()].map((lead) => ({ type: 'direct', lead })),
    ...[...catalogMap.values()].map((lead) => ({ type: 'catalog', lead })),
  ];

  const mappable = [];
  const notMappable = [];
  const diagnostics = {
    resolvedCount: 0,
    lowConfidenceCount: 0,
    failedCount: 0,
    skippedInsufficientInputCount: 0,
    providerBadResponseCount: 0,
    providerRateLimitedCount: 0,
    providerNoResultCount: 0,
    providerNotConfiguredCount: 0,
  };
  for (const item of accessible) {
    if (isLeadMappable(item.lead, env.GEO_MIN_CONFIDENCE_TO_MAP)) {
      mappable.push(buildMappableLead(item.lead, item.type));
      diagnostics.resolvedCount += 1;
    } else {
      const notMappableLead = buildNotMappableLead(item.lead, item.type);
      notMappable.push(notMappableLead);
      if (notMappableLead.reasonCode === 'LOW_CONFIDENCE') diagnostics.lowConfidenceCount += 1;
      else if (notMappableLead.reasonCode === 'SKIPPED_INSUFFICIENT_INPUT') diagnostics.skippedInsufficientInputCount += 1;
      else if (notMappableLead.reasonCode === 'PROVIDER_BAD_RESPONSE') diagnostics.providerBadResponseCount += 1;
      else if (notMappableLead.reasonCode === 'PROVIDER_RATE_LIMITED') diagnostics.providerRateLimitedCount += 1;
      else if (notMappableLead.reasonCode === 'PROVIDER_NO_RESULT') diagnostics.providerNoResultCount += 1;
      else if (notMappableLead.reasonCode === 'PROVIDER_NOT_CONFIGURED') diagnostics.providerNotConfiguredCount += 1;
      else diagnostics.failedCount += 1;
    }
  }

  const limitedMappable = mappable.slice(0, 100);
  return {
    mappable: limitedMappable,
    notMappable,
    summary: {
      requestedCount: dedupedLeadIds.length || accessible.length,
      accessibleCount: accessible.length,
      mappableCount: limitedMappable.length,
      notMappableCount: notMappable.length,
      minConfidenceToMap: env.GEO_MIN_CONFIDENCE_TO_MAP,
      markerLimitApplied: mappable.length > limitedMappable.length,
      diagnostics,
    },
  };
};
