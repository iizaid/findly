import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const publicCampaignSourceSchema = z.enum([
  'GOOGLE_MAPS',
  'REDDIT',
  'WEBSITE',
  'SERPAPI',
  'INSTAGRAM',
  'FACEBOOK',
  'LINKEDIN',
  'TIKTOK',
  'YELP',
  'TRIPADVISOR',
  'YOUTUBE',
  'X',
]);

const sourceSchema = publicCampaignSourceSchema;

export const createProfileSchema = z.object({
  body: z.object({
    workspaceId: z.string().cuid(),
    name: z.string().min(1).max(100),
    serviceType: z.string().min(1).max(50),
    targetBusinessTypes: z.array(z.string()).optional(),
    targetLocations: z.array(z.string()).optional(),
    offerDescription: z.string().optional(),
    idealSignals: z.array(z.string()).optional(),
  }),
});

export const createCampaignSchema = z.object({
  body: z.object({
    workspaceId: z.string().cuid(),
    serviceProfileId: z.string().cuid().optional(),
    name: z.string().min(1).max(100),
    query: z.string().optional(),
    country: z.string().trim().min(1).max(80).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    businessTypes: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    sources: z.array(publicCampaignSourceSchema).min(1).max(10).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    requestedLimit: z.number().int().min(1).max(100).optional().default(20),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const updateLeadStatusSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    status: z.enum(['NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'NOT_A_FIT', 'SAVED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']),
  }),
});

export const getLeadsQuerySchema = z.object({
  query: paginationQuerySchema.extend({
    listId: z.string().cuid().optional(),
    campaignId: z.string().cuid().optional(),
    source: sourceSchema.optional(),
    city: z.string().trim().max(80).optional(),
    scoreLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'GOLD']).optional(),
    status: z.enum(['NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'NOT_A_FIT', 'SAVED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']).optional(),
    missingWebsite: z.enum(['true', 'false']).optional(),
    sortBy: z.enum(['rating', 'reviewCount', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getLeadListLeadsSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  query: paginationQuerySchema.extend({
    source: sourceSchema.optional(),
    city: z.string().trim().max(80).optional(),
    scoreLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'GOLD']).optional(),
    status: z.enum(['NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'NOT_A_FIT', 'SAVED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']).optional(),
    missingWebsite: z.enum(['true', 'false']).optional(),
    sortBy: z.enum(['rating', 'reviewCount', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const estimateCostSchema = z.object({
  query: z.object({
    requestedLimit: z.string().optional(),
    sources: z.string().optional(),
    enrichment: z.enum(['true', 'false']).optional(),
    analysis: z.enum(['true', 'false']).optional(),
  }),
});

export const paginationOnlySchema = z.object({
  query: paginationQuerySchema,
});

export const updateItemStatusSchema = z.object({
  params: z.object({
    listId: z.string().cuid(),
    itemId: z.string().cuid(),
  }),
  body: z.object({
    status: z.enum(['NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'NOT_A_FIT', 'SAVED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']),
  }),
});

export const updateItemNotesSchema = z.object({
  params: z.object({
    listId: z.string().cuid(),
    itemId: z.string().cuid(),
  }),
  body: z.object({
    notes: z.string().max(5000).nullable().optional(),
  }),
});

export const listItemParamSchema = z.object({
  params: z.object({
    listId: z.string().cuid(),
    itemId: z.string().cuid(),
  }),
});
