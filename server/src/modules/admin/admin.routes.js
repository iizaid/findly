import { Router } from 'express';
import { requireAdmin, requireAuth, requireRoot, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as ctrl from './admin.controller.js';
import * as v from './admin.validators.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireVerifiedEmail, requireAdmin);

adminRouter.get('/system/status', ctrl.getSystemStatus);
adminRouter.get('/system/queue', ctrl.getQueueMetrics);
adminRouter.get('/activity', validate(v.adminActivityQuerySchema), ctrl.getActivityLogs);
adminRouter.get('/summary', ctrl.getAdminSummary);
adminRouter.get('/users', validate(v.adminUsersQuerySchema), ctrl.getAdminUsers);
adminRouter.get('/users/:id', ctrl.getAdminUserDetail);
adminRouter.get('/catalog/stats', ctrl.getCatalogStats);
adminRouter.get('/catalog/leads', validate(v.adminCatalogLeadsQuerySchema), ctrl.getCatalogLeads);
adminRouter.post('/catalog/leads', validate(v.adminCreateLeadSchema), ctrl.createCatalogLead);
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
