import { z } from 'zod';

export const creditHistoryQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const estimateSearchQuerySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    sources: z.string().max(500).optional(),
    maxResults: z.coerce.number().int().min(1).max(100).default(20),
    enrichment: z.enum(['true', 'false']).optional(),
    analysis: z.enum(['true', 'false']).optional(),
  }),
});
