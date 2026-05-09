import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

export const adminListQuerySchema = z.object({
  query: paginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
  }),
});

export const adminPaginationSchema = z.object({
  query: paginationQuerySchema,
});

export const adminCatalogLeadsQuerySchema = z.object({
  query: paginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    source: z.string().optional(),
    category: z.string().optional(),
    governorate: z.string().optional(),
    missingWebsite: z.enum(['true', 'false']).optional(),
    hasInstagram: z.enum(['true', 'false']).optional(),
    hasPhone: z.enum(['true', 'false']).optional(),
  }),
});

export const adminCreateLeadSchema = z.object({
  body: z.object({
    businessName: z.string().min(2, 'Business name must be at least 2 characters').max(150),
    category: z.string().max(100).optional().nullable(),
    country: z.string().min(2, 'Country is required').max(100),
    governorate: z.string().max(100).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    websiteUrl: z.union([z.literal(''), z.string().url('Must be a valid URL')]).optional().nullable(),
    instagramUrl: z.union([z.literal(''), z.string().url('Must be a valid URL')]).optional().nullable(),
    facebookUrl: z.union([z.literal(''), z.string().url('Must be a valid URL')]).optional().nullable(),
    googleMapsUrl: z.union([z.literal(''), z.string().url('Must be a valid URL')]).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    whatsappNumber: z.string().max(50).optional().nullable(),
    email: z.union([z.literal(''), z.string().email('Must be a valid email')]).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    sourceType: z.literal('MANUAL_ADMIN'),
  }).superRefine((data, ctx) => {
    if (data.country?.toLowerCase() === 'jordan' && !data.governorate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Governorate is required for Jordan.',
        path: ['governorate'],
      });
    }
  }),
});
