import { Router } from 'express';
import { requireAdmin, requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as ctrl from './admin.controller.js';
import * as v from './admin.validators.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireVerifiedEmail, requireAdmin);

adminRouter.get('/summary', ctrl.getAdminSummary);
adminRouter.get('/users', validate(v.adminListQuerySchema), ctrl.getAdminUsers);
adminRouter.get('/catalog/stats', ctrl.getCatalogStats);
adminRouter.get('/catalog/leads', validate(v.adminCatalogLeadsQuerySchema), ctrl.getCatalogLeads);
adminRouter.post('/catalog/leads', validate(v.adminCreateLeadSchema), ctrl.createCatalogLead);
adminRouter.get('/imports', validate(v.adminPaginationSchema), ctrl.getAdminImports);
adminRouter.get('/campaigns', validate(v.adminPaginationSchema), ctrl.getAdminCampaigns);
adminRouter.get('/security/events', validate(v.adminPaginationSchema), ctrl.getSecurityEvents);
adminRouter.get('/errors', validate(v.adminPaginationSchema), ctrl.getBackendErrors);

import multer from 'multer';
import * as bulkCtrl from './bulkImport.controller.js';
import path from 'node:path';
import crypto from 'node:crypto';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(process.cwd(), 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

adminRouter.post('/imports/parse', upload.single('file'), bulkCtrl.parseImportFile);
adminRouter.post('/imports/commit', bulkCtrl.commitImportFile);
