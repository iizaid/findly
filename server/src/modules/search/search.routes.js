import { Router } from 'express';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { analysisRateLimiter, searchRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as ctrl from './search.controller.js';
import * as v from './search.validators.js';

export const searchRouter = Router();

searchRouter.use(requireAuth, requireVerifiedEmail);

// Sources
searchRouter.get('/sources/status', ctrl.getSourceStatus);
searchRouter.get('/options', ctrl.getSearchOptions);

// Dashboard intelligence
searchRouter.get('/intelligence', ctrl.getDashboardIntelligence);

// Service profiles
searchRouter.get('/profiles', ctrl.getServiceProfiles);
searchRouter.post('/profiles', validate(v.createProfileSchema), ctrl.createServiceProfile);

// Campaigns
searchRouter.get('/campaigns', validate(v.paginationOnlySchema), ctrl.getCampaigns);
searchRouter.post('/campaigns', validate(v.createCampaignSchema), ctrl.createNewCampaign);
searchRouter.get('/campaigns/:id', validate(v.idParamSchema), ctrl.getCampaignById);
searchRouter.get('/campaigns/:id/status', validate(v.idParamSchema), ctrl.getCampaignStatus);
searchRouter.post('/campaigns/:id/run', searchRateLimiter, validate(v.idParamSchema), ctrl.runExistingCampaign);
searchRouter.post('/campaigns/:id/analyze', analysisRateLimiter, validate(v.idParamSchema), ctrl.analyzeExistingCampaign);
searchRouter.get('/campaigns/:id/leads', validate(v.idParamSchema), ctrl.getCampaignLeads);
searchRouter.get('/campaigns/:id/analytics', validate(v.idParamSchema), ctrl.getCampaignAnalyticsData);

// Lead lists
searchRouter.get('/lists', validate(v.paginationOnlySchema), ctrl.getLeadLists);
searchRouter.get('/lists/:id', validate(v.idParamSchema), ctrl.getLeadListById);
searchRouter.get('/lists/:id/leads', validate(v.getLeadListLeadsSchema), ctrl.getLeads);
searchRouter.get('/opportunity-signals', validate(v.paginationOnlySchema), ctrl.getOpportunitySignals);

// Leads
searchRouter.get('/leads', validate(v.getLeadsQuerySchema), ctrl.getLeads);
searchRouter.get('/leads/map', ctrl.getLeadsForMap);
searchRouter.get('/leads/:id', validate(v.idParamSchema), ctrl.getLeadDetail);
searchRouter.post('/leads/:id/analyze', analysisRateLimiter, validate(v.idParamSchema), ctrl.analyzeExistingLead);
searchRouter.post('/leads/:id/enrich-website', analysisRateLimiter, validate(v.idParamSchema), ctrl.enrichLeadWebsite);
searchRouter.patch('/leads/:id/status', analysisRateLimiter, validate(v.updateLeadStatusSchema), ctrl.updateLeadStatus);
searchRouter.delete('/leads/:id', validate(v.idParamSchema), ctrl.deleteLead);

// Credits
searchRouter.get('/credits', ctrl.getCreditsHistory);
searchRouter.get('/credits/estimate', validate(v.estimateCostSchema), ctrl.estimateSearchCost);
