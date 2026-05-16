import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { toPagination } from '../../utils/pagination.js';
import { mapRawLocationToGovernorate, leadMatchesGovernorate } from '../search/locationNormalization.js';
import { getSearchQueueMetrics } from '../jobs/jobQueue.service.js';
import { getAiProviderStatuses } from '../ai/aiRouter.service.js';
import {
  deleteProviderSecret,
  isAiSecretManagementConfigured,
  listProviderSecretStatuses,
  testProviderSecret,
  upsertProviderSecret,
} from '../ai/aiSecretsVault.service.js';
import { canManageRole, formatRole } from '../auth/roles.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

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

export const getQueueMetrics = asyncHandler(async (_req, res) => {
  const metrics = await getSearchQueueMetrics();
  return successResponse(res, { queue: metrics }, 'Queue metrics loaded.');
});

const buildSafeAiProviderStatuses = async () => {
  const base = getAiProviderStatuses();
  const dashboardStatuses = await listProviderSecretStatuses();
  const dashboardByProvider = new Map(dashboardStatuses.map((status) => [status.provider, status]));

  return {
    enabled: base.enabled,
    secretManagementConfigured: isAiSecretManagementConfigured(),
    defaultProvider: base.defaultProvider,
    defaultModel: base.defaultModel,
    leadAnalysis: base.leadAnalysis,
    providers: base.providers.map((provider) => {
      const dashboard = dashboardByProvider.get(provider.provider);
      if (dashboard?.status === 'ACTIVE') {
        return {
          ...provider,
          configured: true,
          source: 'dashboard',
          status: provider.status === 'degraded' ? 'degraded' : 'configured',
          model: dashboard.model || provider.model,
          baseUrlConfigured: dashboard.baseUrlConfigured || provider.baseUrlConfigured,
          fingerprint: dashboard.fingerprint,
          lastTestedAt: dashboard.lastTestedAt,
          lastStatus: dashboard.lastStatus,
          lastErrorType: dashboard.lastErrorType,
        };
      }

      return {
        ...provider,
        source: provider.configured ? 'env' : 'missing',
        fingerprint: null,
        lastTestedAt: dashboard?.lastTestedAt || null,
        lastStatus: dashboard?.lastStatus || null,
        lastErrorType: dashboard?.lastErrorType || null,
      };
    }),
  };
};

const assertConfirmProvider = (provider, confirmProvider) => {
  if (provider !== confirmProvider) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Provider confirmation does not match.', 400);
  }
};

export const getAdminAiProviders = asyncHandler(async (_req, res) => {
  const status = await buildSafeAiProviderStatuses();
  return successResponse(res, status, 'AI provider statuses loaded.');
});

export const updateAdminAiProviderSecret = asyncHandler(async (req, res) => {
  const { provider } = req.validated.params;
  const { apiKey, model, baseUrl, confirmProvider, reason } = req.validated.body;
  assertConfirmProvider(provider, confirmProvider);

  const status = await upsertProviderSecret({
    provider,
    apiKey,
    model,
    baseUrl,
    actorId: req.user.id,
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'AI_PROVIDER_SECRET_UPDATED',
      entityType: 'AiProviderSecret',
      entityId: provider,
      metadata: {
        actorId: req.user.id,
        provider,
        source: 'dashboard',
        fingerprint: status.fingerprint,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  });

  return successResponse(res, { provider: status }, 'AI provider secret saved.');
});

export const deleteAdminAiProviderSecret = asyncHandler(async (req, res) => {
  const { provider } = req.validated.params;
  const { confirmProvider, reason } = req.validated.body;
  assertConfirmProvider(provider, confirmProvider);

  const status = await deleteProviderSecret({ provider, actorId: req.user.id });

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'AI_PROVIDER_SECRET_DELETED',
      entityType: 'AiProviderSecret',
      entityId: provider,
      metadata: {
        actorId: req.user.id,
        provider,
        source: 'dashboard',
        fingerprint: status?.fingerprint || null,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  });

  return successResponse(res, { provider: status }, 'AI provider dashboard secret removed.');
});

export const testAdminAiProviderSecret = asyncHandler(async (req, res) => {
  const { provider } = req.validated.params;
  const { confirmProvider } = req.validated.body;
  assertConfirmProvider(provider, confirmProvider);

  const result = await testProviderSecret({ provider, actorId: req.user.id });

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'AI_PROVIDER_SECRET_TESTED',
      entityType: 'AiProviderSecret',
      entityId: provider,
      metadata: {
        actorId: req.user.id,
        provider,
        ok: result.ok,
        model: result.model,
        errorType: result.errorType,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    },
  });

  return successResponse(res, { result }, 'AI provider test completed.');
});

export const getAdminUsers = asyncHandler(async (req, res) => {
  const pagination = toPagination(req.validated.query);
  const { search, role, emailVerified } = req.validated.query;
  const and = [];

  if (search) {
    and.push({
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (role) {
    and.push({ role });
  }

  if (emailVerified === 'true') {
    and.push({ emailVerified: true });
  } else if (emailVerified === 'false') {
    and.push({ emailVerified: false });
  }

  const where = and.length ? { AND: and } : {};

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

  const and = [];

  if (search) {
    and.push({
      OR: [
        { businessName: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (source) {
    and.push({ source });
  }

  if (category) {
    and.push({ category });
  }

  // Governorate: broad Prisma pre-filter, then precise JS normalization post-filter
  if (governorate) {
    and.push({
      OR: [
        { city: { contains: governorate, mode: 'insensitive' } },
        { address: { contains: governorate, mode: 'insensitive' } },
      ],
    });
  }

  if (missingWebsite === 'true') {
    and.push({ websiteUrl: null });
  } else if (missingWebsite === 'false') {
    and.push({ websiteUrl: { not: null } });
  }

  if (hasInstagram === 'true') {
    and.push({
      OR: [
        { instagramUrl: { not: null } },
        { instagramUsername: { not: null } },
      ],
    });
  } else if (hasInstagram === 'false') {
    and.push({ instagramUrl: null, instagramUsername: null });
  }

  if (hasPhone === 'true') {
    and.push({
      OR: [
        { phone: { not: null } },
        { whatsappNumber: { not: null } },
      ],
    });
  } else if (hasPhone === 'false') {
    and.push({ phone: null, whatsappNumber: null });
  }

  const where = and.length ? { AND: and } : {};

  // When governorate filter is active, we over-fetch from Prisma (which does broad
  // string matching) and then refine with the normalizer to handle neighborhoods
  // like "Sweifieh" → Amman. Pagination is applied after JS filtering.
  if (governorate) {
    const allCandidates = await prisma.leadCatalog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        country: true,
        source: true,
        address: true,
        websiteUrl: true,
        instagramUrl: true,
        instagramUsername: true,
        phone: true,
        whatsappNumber: true,
        detectedSignals: true,
        importedAt: true,
        createdAt: true,
        rawData: true,
      },
    });

    const filtered = allCandidates.filter((lead) => leadMatchesGovernorate(lead, governorate));
    const total = filtered.length;
    const leads = filtered.slice(skip, skip + limit).map(({ rawData: _rawData, ...rest }) => rest);

    return successResponse(res, {
      leads,
      pagination: { page, limit, total },
    }, 'Catalog leads loaded.');
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

export const getSystemStatus = asyncHandler(async (_req, res) => {
  const dbInfo = { status: 'offline', message: 'Database connection failed.' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbInfo.status = 'online';
    dbInfo.message = 'Database is connected and responsive.';
  } catch {
    dbInfo.status = 'degraded';
    dbInfo.message = 'Database is experiencing issues.';
  }

  let totalCatalogLeads = 0;
  try {
    totalCatalogLeads = await prisma.leadCatalog.count();
  } catch {
    // leave as 0
  }

  const { getSourceStatuses } = await import('../search/source.registry.js');
  const sources = getSourceStatuses().map(s => ({
    key: s.key,
    label: s.label,
    status: s.status,
    configured: s.configured,
    available: s.available,
    message: s.reason || s.description || ''
  }));

  const { env } = await import('../../config/env.js');

  const systemStatus = {
    database: {
      status: dbInfo.status,
      label: 'Database',
      message: dbInfo.message,
      checkedAt: new Date().toISOString()
    },
    localDataset: {
      status: totalCatalogLeads > 0 ? 'available' : 'empty',
      label: 'Local Dataset',
      totalCatalogLeads,
      message: totalCatalogLeads > 0 
        ? 'Internal searchable catalog is available.' 
        : 'No catalog leads loaded yet.'
    },
    sources,
    importPipeline: {
      status: 'available',
      label: 'Bulk Import Pipeline',
      allowedFileTypes: ['.csv', '.xlsx'],
      ttlMinutes: env.IMPORT_UPLOAD_TTL_MINUTES || 60,
      message: 'File upload and parsing pipeline is operational.'
    },
    adminSystem: {
      status: 'available',
      label: 'Admin Operations',
      message: 'Admin system is fully operational.'
    },
    aiProviders: {
      status: env.AI_ENABLED ? 'configured' : 'disabled',
      label: 'AI Providers',
      message: env.AI_ENABLED
        ? 'AI provider routing is enabled. Provider keys remain server-side only.'
        : 'AI provider routing is disabled. Rule-based analysis remains active.',
      ...getAiProviderStatuses(),
    }
  };

  return successResponse(res, systemStatus, 'System status loaded.');
});

const sanitizeMetadata = (meta) => {
  if (!meta || typeof meta !== 'object') return null;
  const safeMeta = { ...meta };
  const sensitiveKeys = ['password', 'passwordhash', 'token', 'tokenhash', 'session', 'cookie', 'authorization', 'apikey', 'secret', 'smtp', 'url', 'key', 'body', 'headers'];
  
  for (const k of Object.keys(safeMeta)) {
    const keyLower = k.toLowerCase();
    if (sensitiveKeys.some(sk => keyLower.includes(sk))) {
      safeMeta[k] = '[REDACTED]';
    } else if (typeof safeMeta[k] === 'object') {
      safeMeta[k] = sanitizeMetadata(safeMeta[k]);
    } else if (typeof safeMeta[k] === 'string' && safeMeta[k].length > 200) {
      safeMeta[k] = safeMeta[k].substring(0, 200) + '...';
    }
  }
  return safeMeta;
};

export const getActivityLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = toPagination(req.validated.query);
  const { category, severity, type, search, from, to } = req.validated.query;

  const fetchLimit = 1000;
  
  let auditWhere = {};
  let errorWhere = {};
  
  if (from || to) {
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    auditWhere.createdAt = dateFilter;
    errorWhere.createdAt = dateFilter;
  }
  
  if (type) {
    auditWhere.action = type;
    errorWhere.errorCode = type;
  }

  const [audits, errors] = await Promise.all([
    prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      include: { user: { select: { email: true, role: true } } }
    }),
    prisma.backendErrorLog.findMany({
      where: errorWhere,
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      include: { user: { select: { email: true, role: true } } }
    })
  ]);

  let combined = [];

  for (const audit of audits) {
    let cat = 'system';
    let sev = 'info';
    let title = audit.action;
    
    if (audit.action.startsWith('USER_')) { cat = 'auth'; sev = 'info'; }
    if (audit.action.includes('FAILED') || audit.action.includes('DENIED') || audit.action.includes('REVOKED')) sev = 'warning';
    if (audit.action.includes('CSRF') || audit.action.includes('RATE_LIMIT')) sev = 'critical';
    if (audit.action.includes('SECURITY') || audit.action.includes('DENIED')) cat = 'security';
    if (audit.action.startsWith('SEARCH_') || audit.action.startsWith('LEADLIST_')) cat = 'search';
    if (audit.action.includes('LEADLIST_')) cat = 'lead_list';
    if (audit.action.includes('IMPORT') || audit.action.includes('DATASET')) cat = 'import';
    if (audit.action.startsWith('ADMIN_')) { cat = 'admin'; sev = 'info'; }
    if (audit.action === 'ADMIN_ACCESS_DENIED') { cat = 'security'; sev = 'warning'; }
    if (audit.action === 'CSRF_FAILED') { cat = 'security'; sev = 'critical'; }

    combined.push({
      id: audit.id,
      type: audit.action,
      category: cat,
      severity: sev,
      title,
      description: audit.action.replace(/_/g, ' '),
      actorEmail: audit.user?.email || null,
      actorRole: audit.user?.role || null,
      entityType: audit.entityType || null,
      entityId: audit.entityId || null,
      ipAddress: audit.ipAddress || null,
      userAgent: audit.userAgent || null,
      metadataSummary: sanitizeMetadata(audit.metadata),
      createdAt: audit.createdAt
    });
  }

  for (const err of errors) {
    let sev = err.statusCode >= 500 ? 'critical' : 'warning';
    
    combined.push({
      id: err.id,
      type: err.errorCode,
      category: 'error',
      severity: sev,
      title: `Error: ${err.errorCode}`,
      description: err.message,
      actorEmail: err.user?.email || null,
      actorRole: err.user?.role || null,
      route: err.route || null,
      method: err.method || null,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      requestId: err.requestId || null,
      ipAddress: err.ipAddress || null,
      userAgent: err.userAgent || null,
      metadataSummary: null,
      createdAt: err.createdAt
    });
  }

  if (category) combined = combined.filter(c => c.category === category);
  if (severity) combined = combined.filter(c => c.severity === severity);
  
  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(c => 
      c.actorEmail?.toLowerCase().includes(s) ||
      c.type.toLowerCase().includes(s) ||
      c.requestId?.toLowerCase().includes(s) ||
      c.route?.toLowerCase().includes(s) ||
      c.errorCode?.toLowerCase().includes(s) ||
      c.description?.toLowerCase().includes(s)
    );
  }

  combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  const total = combined.length;
  const paginated = combined.slice(skip, skip + limit);

  return successResponse(res, {
    activity: paginated,
    pagination: { page, limit, total }
  }, 'Activity logs loaded.');
});

/* ================================================================ */
/*  ROOT-ONLY: Role Management                                      */
/* ================================================================ */

export const getAdminUserDetail = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: safeUserSelect,
  });

  if (!user) {
    throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
  }

  const { sessions, ...safeUser } = user;
  safeUser.lastLoginAt = sessions?.[0]?.createdAt || null;

  return successResponse(res, { user: safeUser }, 'User detail loaded.');
});

export const changeUserRole = asyncHandler(async (req, res) => {
  const { role: nextRole, reason, confirmEmail } = req.validated.body;
  const targetId = req.params.id;

  // 1. Load target user
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
  }

  // 2. Confirm email must match
  if (confirmEmail !== target.email) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Confirm email does not match the target user.', 400);
  }

  // 3. Check if target is last ROOT
  let isLastRoot = false;
  if (target.role === 'ROOT') {
    const rootCount = await prisma.user.count({ where: { role: 'ROOT' } });
    isLastRoot = rootCount <= 1;
  }

  // 4. Validate permission
  const check = canManageRole({
    actorRole: req.user.role,
    targetRole: target.role,
    nextRole,
    isLastRoot,
    sameUser: req.user.id === target.id,
  });

  if (!check.allowed) {
    throw new AppError(errorCodes.FORBIDDEN, check.reason, 403);
  }

  // 5. Apply change
  const previousRole = target.role;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: targetId },
      data: { role: nextRole },
      select: safeUserSelect,
    });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_ROLE_CHANGED',
        entityType: 'User',
        entityId: targetId,
        metadata: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          targetUserId: targetId,
          targetEmail: target.email,
          previousRole,
          nextRole,
          reason,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    });

    return u;
  });

  const { sessions, ...safeUser } = updated;
  safeUser.lastLoginAt = sessions?.[0]?.createdAt || null;

  return successResponse(res, {
    user: safeUser,
    change: {
      from: formatRole(previousRole),
      to: formatRole(nextRole),
    },
  }, `Role changed from ${formatRole(previousRole)} to ${formatRole(nextRole)}.`);
});

export const grantUserCredits = asyncHandler(async (req, res) => {
  const { amount, reason, confirmEmail } = req.validated.body;
  const targetId = req.params.id;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
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
    },
  });

  if (!target) {
    throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
  }

  if (confirmEmail !== target.email) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Confirm email does not match the target user.', 400);
  }

  const previousBalance = target.creditsBalance;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: target.id },
      data: { creditsBalance: { increment: amount } },
      select: {
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
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: target.id,
        workspaceId: null,
        type: 'CREDIT_GRANTED',
        amount,
        balanceAfter: updated.creditsBalance,
        reason: `Admin credit grant: ${reason}`,
        referenceType: 'AdminCreditGrant',
        referenceId: target.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_CREDITS_GRANTED',
        entityType: 'User',
        entityId: target.id,
        metadata: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          targetUserId: target.id,
          targetEmail: target.email,
          amount,
          previousBalance,
          newBalance: updated.creditsBalance,
          reason,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    });

    return updated;
  });

  return successResponse(res, { user: result }, 'Credits granted successfully.');
});
