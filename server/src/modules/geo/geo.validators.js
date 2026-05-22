import { z } from 'zod';

const leadIdsString = z.string().trim().min(1).max(5000);

export const getLeadMapSchema = z.object({
  query: z.object({
    leadIds: leadIdsString.optional(),
    listId: z.string().cuid().optional(),
  }),
});

export const createLeadMapEnrichmentJobSchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().cuid()).max(100).optional().default([]),
    listId: z.string().cuid().optional(),
    forceRefresh: z.boolean().optional().default(false),
  }),
});

export const geoJobParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});
