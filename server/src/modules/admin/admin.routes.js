import { Router } from 'express';
import { requireAdmin, requireAuth, requireRoot, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { aiProviderTestRateLimiter, websiteEnrichmentRateLimiter } from '../../middleware/rateLimit.middleware.js';
import * as ctrl from './admin.controller.js';
import * as v from './admin.validators.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireVerifiedEmail, requireAdmin);

adminRouter.get('/system/status', ctrl.getSystemStatus);
adminRouter.get('/system/queue', ctrl.getQueueMetrics);
adminRouter.get('/discovery-readiness', ctrl.getDiscoveryReadiness);
adminRouter.get('/activity', validate(v.adminActivityQuerySchema), ctrl.getActivityLogs);
adminRouter.get('/summary', ctrl.getAdminSummary);
adminRouter.get('/users', validate(v.adminUsersQuerySchema), ctrl.getAdminUsers);
adminRouter.get('/users/:id', ctrl.getAdminUserDetail);
adminRouter.post('/users/:id/credits/grant', requireRoot, validate(v.adminGrantCreditsSchema), ctrl.grantUserCredits);
adminRouter.get('/ai/providers', requireRoot, ctrl.getAdminAiProviders);
adminRouter.put('/ai/providers/:provider/secret', requireRoot, validate(v.adminAiProviderSecretUpsertSchema), ctrl.updateAdminAiProviderSecret);
adminRouter.delete('/ai/providers/:provider/secret', requireRoot, validate(v.adminAiProviderSecretDeleteSchema), ctrl.deleteAdminAiProviderSecret);
adminRouter.post('/ai/providers/:provider/test', requireRoot, aiProviderTestRateLimiter, validate(v.adminAiProviderTestSchema), ctrl.testAdminAiProviderSecret);
adminRouter.get('/discovery/providers', ctrl.getAdminDiscoveryProviders);
adminRouter.put('/discovery/providers/:provider/secret', requireRoot, validate(v.adminDiscoveryProviderSecretUpsertSchema), ctrl.updateAdminDiscoveryProviderSecret);
adminRouter.delete('/discovery/providers/:provider/secret', requireRoot, validate(v.adminDiscoveryProviderSecretDeleteSchema), ctrl.deleteAdminDiscoveryProviderSecret);
adminRouter.post('/discovery/providers/:provider/test', requireRoot, aiProviderTestRateLimiter, validate(v.adminDiscoveryProviderTestSchema), ctrl.testAdminDiscoveryProviderSecret);
adminRouter.get('/catalog/stats', ctrl.getCatalogStats);
adminRouter.get('/catalog/leads', validate(v.adminCatalogLeadsQuerySchema), ctrl.getCatalogLeads);
adminRouter.post('/catalog/leads', validate(v.adminCreateLeadSchema), ctrl.createCatalogLead);
adminRouter.get('/catalog-leads/:id/website-intelligence', validate(v.adminWebsiteIntelligenceParamSchema), ctrl.getCatalogLeadWebsiteIntelligence);
adminRouter.post('/catalog-leads/:id/enrich-website', websiteEnrichmentRateLimiter, validate(v.adminWebsiteEnrichmentSchema), ctrl.enrichCatalogLeadWebsite);
adminRouter.get('/leads/:id/website-intelligence', validate(v.adminWebsiteIntelligenceParamSchema), ctrl.getLeadWebsiteIntelligence);
adminRouter.post('/leads/:id/enrich-website', websiteEnrichmentRateLimiter, validate(v.adminWebsiteEnrichmentSchema), ctrl.enrichLeadWebsiteIntelligence);
adminRouter.get('/imports', validate(v.adminPaginationSchema), ctrl.getAdminImports);
adminRouter.get('/campaigns', validate(v.adminPaginationSchema), ctrl.getAdminCampaigns);
adminRouter.get('/security/events', validate(v.adminPaginationSchema), ctrl.getSecurityEvents);
adminRouter.get('/errors', validate(v.adminPaginationSchema), ctrl.getBackendErrors);

// ROOT-only: Role management
adminRouter.patch('/users/:id/role', requireRoot, validate(v.adminChangeRoleSchema), ctrl.changeUserRole);

import multer from 'multer';
import * as bulkCtrl from './bulkImport.controller.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { getAdminUploadDir, uploadFileFilter } from './uploadCleanup.service.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getAdminUploadDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: uploadFileFilter });

adminRouter.post('/imports/parse', upload.single('file'), bulkCtrl.parseImportFile);
adminRouter.post('/imports/commit', validate(v.commitImportSchema), bulkCtrl.commitImportFile);
