import { Router } from 'express';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { analysisRateLimiter } from '../../middleware/rateLimit.middleware.js';
import * as ctrl from './geo.controller.js';
import * as v from './geo.validators.js';

export const leadMapRouter = Router();
leadMapRouter.use(requireAuth, requireVerifiedEmail);

leadMapRouter.get('/', validate(v.getLeadMapSchema), ctrl.getLeadMap);
leadMapRouter.post('/enrich', analysisRateLimiter, validate(v.createLeadMapEnrichmentJobSchema), ctrl.createLeadMapEnrichmentJob);

export const geoRouter = Router();
geoRouter.use(requireAuth, requireVerifiedEmail);

geoRouter.get('/enrichment/jobs/:id', validate(v.geoJobParamSchema), ctrl.getGeoEnrichmentJob);
