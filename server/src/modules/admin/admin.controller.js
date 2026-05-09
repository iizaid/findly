import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { toPagination } from '../../utils/pagination.js';
import { mapRawLocationToGovernorate } from '../search/locationNormalization.js';

const securityActions = [
  'FAILED_LOGIN',
  'ADMIN_ACCESS_DENIED',
  'DASHBOARD_ACCESS_DENIED_UNVERIFIED',
  'SESSION_REVOKED',
  'USER_LOGGED_OUT',
  'EMAIL_VERIFICATION_FAILED',
  'EMAIL_VERIFICATION_RESENT',
  'EMAIL_VERIFIED',
  'DATASET_IMPORTED',
  'SEARCH_CAMPAIGN_LOCAL_DATASET_RUN',
  'SEARCH_CAMPAIGN_LOCAL_DATASET_FALLBACK',
  'ADMIN_BULK_IMPORT_COMMITTED',
];

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  plan: true,
  creditsBalance: true,
  emailVerified: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  sessions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { createdAt: true },
  },
};

export const getAdminSummary = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    verifiedUsers,
    totalCatalogLeads,
    totalLeadLists,
    totalCampaigns,
    totalDatasetImports,
    recentErrors,
    recentSecurityEvents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.leadCatalog.count(),
    prisma.leadList.count(),
    prisma.searchCampaign.count(),
    prisma.datasetImport.count(),
    prisma.backendErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, requestId: true, route: true, method: true, statusCode: true, errorCode: true, message: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { action: { in: securityActions } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, entityType: true, entityId: true, ipAddress: true, createdAt: true },
    }),
  ]);

  return successResponse(res, {
    totals: {
      totalUsers,
      verifiedUsers,
      totalCatalogLeads,
      totalLeadLists,
      totalCampaigns,
      totalDatasetImports,
      recentErrors: recentErrors.length,
      recentSecurityEvents: recentSecurityEvents.length,
    },
    recentErrors,
    recentSecurityEvents,
  }, 'Admin summary loaded.');
});

export const getAdminUsers = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const search = req.validated.query.search;
  const where = search
    ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    }
    : {};

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: safeUserSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return successResponse(res, {
    users: users.map(({ sessions, ...user }) => ({
      ...user,
      lastLoginAt: sessions?.[0]?.createdAt || null,
    })),
    pagination: { page: pagination.page, limit: pagination.limit, total },
  }, 'Admin users loaded.');
});

export const getCatalogStats = asyncHandler(async (_req, res) => {
  const [total, bySource, byCategory, imports] = await Promise.all([
    prisma.leadCatalog.count(),
    prisma.leadCatalog.groupBy({ by: ['source'], _count: true, orderBy: { _count: { source: 'desc' } } }),
    prisma.leadCatalog.groupBy({ by: ['category'], _count: true, orderBy: { _count: { category: 'desc' } }, take: 20 }),
    prisma.datasetImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        sourceType: true,
        status: true,
        totalRows: true,
        importedRows: true,
        duplicateRows: true,
        skippedRows: true,
        errorRows: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
      },
    }),
  ]);

  const cities = await prisma.leadCatalog.findMany({
    select: { city: true, address: true, rawData: true },
    take: 5000,
  });
  const governorateCounts = new Map();
  for (const lead of cities) {
    const governorate = mapRawLocationToGovernorate(lead.city)
      || mapRawLocationToGovernorate(lead.address)
      || mapRawLocationToGovernorate(lead.rawData?.Location)
      || mapRawLocationToGovernorate(lead.rawData?.City);
    if (!governorate) continue;
    governorateCounts.set(governorate, (governorateCounts.get(governorate) || 0) + 1);
  }

  return successResponse(res, {
    total,
    bySource: bySource.map((item) => ({ source: item.source || 'UNKNOWN', count: item._count })),
    byGovernorate: [...governorateCounts.entries()]
      .map(([governorate, count]) => ({ governorate, count }))
      .sort((a, b) => b.count - a.count),
    byCategory: byCategory.filter((item) => item.category).map((item) => ({ category: item.category, count: item._count })),
    imports,
  }, 'Catalog stats loaded.');
});

export const getAdminImports = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const [imports, total] = await prisma.$transaction([
    prisma.datasetImport.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        fileName: true,
        sourceType: true,
        status: true,
        totalRows: true,
        importedRows: true,
        duplicateRows: true,
        skippedRows: true,
        errorRows: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        createdAt: true,
      },
    }),
    prisma.datasetImport.count(),
  ]);

  return successResponse(res, { imports, pagination: { page: pagination.page, limit: pagination.limit, total } }, 'Dataset imports loaded.');
});

export const getAdminCampaigns = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const [campaigns, total] = await prisma.$transaction([
    prisma.searchCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        name: true,
        status: true,
        sources: true,
        resultCount: true,
        creditsUsed: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true } },
        leadLists: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { sourceRequested: true, sourceUsed: true, fallbackUsed: true, resultCount: true },
        },
      },
    }),
    prisma.searchCampaign.count(),
  ]);

  return successResponse(res, {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      latestResultSet: campaign.leadLists?.[0] || null,
      leadLists: undefined,
    })),
    pagination: { page: pagination.page, limit: pagination.limit, total },
  }, 'Search campaigns loaded.');
});

export const getSecurityEvents = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const where = { action: { in: securityActions } };
  const [events, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { id: true, email: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return successResponse(res, { events, pagination: { page: pagination.page, limit: pagination.limit, total } }, 'Security events loaded.');
});

export const getBackendErrors = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const [errors, total] = await prisma.$transaction([
    prisma.backendErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        requestId: true,
        route: true,
        method: true,
        statusCode: true,
        errorCode: true,
        message: true,
        createdAt: true,
        user: { select: { id: true, email: true, role: true } },
      },
    }),
    prisma.backendErrorLog.count(),
  ]);

  return successResponse(res, { errors, pagination: { page: pagination.page, limit: pagination.limit, total } }, 'Backend errors loaded.');
});

export const getCatalogLeads = asyncHandler(async (req, res) => {
  const { page, limit, skip } = toPagination(req.validated.query);
  const { search, source, category, governorate, missingWebsite, hasInstagram, hasPhone } = req.validated.query;

  const where = {};

  if (search) {
    where.businessName = { contains: search, mode: 'insensitive' };
  }
  
  if (source) {
    where.source = source;
  }
  
  if (category) {
    where.category = category;
  }

  // Very naive governorate matching: just checking city or address string if requested
  if (governorate) {
    where.OR = [
      { city: { contains: governorate, mode: 'insensitive' } },
      { address: { contains: governorate, mode: 'insensitive' } },
    ];
  }

  if (missingWebsite === 'true') {
    where.websiteUrl = null;
  } else if (missingWebsite === 'false') {
    where.websiteUrl = { not: null };
  }

  if (hasInstagram === 'true') {
    where.instagramUrl = { not: null };
  } else if (hasInstagram === 'false') {
    where.instagramUrl = null;
  }

  if (hasPhone === 'true') {
    where.OR = [
      ...(where.OR || []),
      { phone: { not: null } },
      { whatsappNumber: { not: null } }
    ];
  } else if (hasPhone === 'false') {
    where.phone = null;
    where.whatsappNumber = null;
  }

  const [leads, total] = await prisma.$transaction([
    prisma.leadCatalog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        country: true,
        source: true,
        websiteUrl: true,
        instagramUrl: true,
        phone: true,
        whatsappNumber: true,
        detectedSignals: true,
        importedAt: true,
        createdAt: true,
      },
    }),
    prisma.leadCatalog.count({ where }),
  ]);

  return successResponse(res, {
    leads,
    pagination: { page, limit, total },
  }, 'Catalog leads loaded.');
});

export const createCatalogLead = asyncHandler(async (req, res) => {
  const data = req.validated.body;
  
  const detectedSignals = [];
  if (data.websiteUrl) detectedSignals.push('HAS_WEBSITE');
  else detectedSignals.push('NO_WEBSITE');
  if (data.instagramUrl) detectedSignals.push('HAS_INSTAGRAM');
  if (data.phone) detectedSignals.push('HAS_PHONE');
  if (data.whatsappNumber) detectedSignals.push('HAS_WHATSAPP');
  if (data.email) detectedSignals.push('HAS_EMAIL');
  detectedSignals.push('MANUAL_ADMIN_ENTRY');

  const lead = await prisma.leadCatalog.create({
    data: {
      businessName: data.businessName,
      category: data.category || null,
      country: data.country,
      city: data.governorate || null,
      address: data.address || null,
      websiteUrl: data.websiteUrl || null,
      instagramUrl: data.instagramUrl || null,
      facebookUrl: data.facebookUrl || null,
      googleMapsUrl: data.googleMapsUrl || null,
      phone: data.phone || null,
      whatsappNumber: data.whatsappNumber || null,
      email: data.email || null,
      source: data.sourceType,
      detectedSignals,
      importedAt: new Date(),
      rawData: { notes: data.notes },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'ADMIN_CATALOG_LEAD_CREATED',
      entityType: 'LeadCatalog',
      entityId: lead.id,
      metadata: { businessName: lead.businessName },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  return successResponse(res, { lead }, 'Manual lead added to catalog successfully.', 201);
});
