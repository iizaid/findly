import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const datasetSourceTypeSchema = z.enum([
  'LOCAL_DATASET',
  'DATASET_IMPORT',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'MANUAL_ADMIN',
]);

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

// Fields an admin can map a source column to
export const ALLOWED_TARGET_FIELDS = new Set([
  'ignore',
  'businessName', 'category', 'country', 'governorate', 'city', 'address',
  'phone', 'whatsappNumber', 'email',
  'websiteUrl', 'instagramUrl', 'instagramUsername', 'facebookUrl', 'googleMapsUrl',
  'rating', 'reviewCount', 'notes', 'sourceUrl', 'sourceType',
]);


const mappingColumnSchema = z.object({
  sourceHeader: z.string().min(1).max(200),
  targetField: z.string().refine(
    (f) => ALLOWED_TARGET_FIELDS.has(f),
    { message: 'Unknown target field.' },
  ),
});

const mappingSheetSchema = z.object({
  sheetName: z.string().min(1).max(200),
  columns: z.array(mappingColumnSchema).min(1),
}).superRefine((data, ctx) => {
  const seen = new Set();
  data.columns.forEach((col, i) => {
    if (col.targetField === 'ignore') return;
    if (seen.has(col.targetField)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate mapping for field "${col.targetField}".`,
        path: ['columns', i, 'targetField'],
      });
    }
    seen.add(col.targetField);
  });
  if (!seen.has('businessName')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A column must be mapped to "businessName".',
      path: ['columns'],
    });
  }
});

export const commitImportSchema = z.object({
  body: z.object({
    fileKey: z.string().min(1).max(200),
    sourceType: datasetSourceTypeSchema.optional().nullable(),
    mappingConfig: z.object({
      sheets: z.array(mappingSheetSchema).min(1),
    }).optional().nullable(),
  }),
});

export const adminActivityQuerySchema = z.object({
  query: paginationQuerySchema.extend({
    category: z.string().max(50).optional(),
    severity: z.string().max(20).optional(),
    type: z.string().max(100).optional(),
    search: z.string().max(120).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

export const adminUsersQuerySchema = z.object({
  query: paginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'ROOT']).optional(),
    emailVerified: z.enum(['true', 'false']).optional(),
  }),
});

export const adminChangeRoleSchema = z.object({
  body: z.object({
    role: z.enum(['USER', 'MODERATOR', 'ADMIN'], { message: 'Role must be USER, MODERATOR, or ADMIN.' }),
    reason: z.string().min(8, 'Reason must be at least 8 characters.').max(500),
    confirmEmail: z.string().email('Must be a valid email address.'),
  }),
});

export const adminGrantCreditsSchema = z.object({
  body: z.object({
    amount: z.number().int().min(1).max(1000000),
    reason: z.string().trim().min(8, 'Reason must be at least 8 characters.').max(500),
    confirmEmail: z.string().email('Must be a valid email address.'),
  }),
});

const aiProviderSchema = z.enum(['gemini', 'openai', 'anthropic', 'deepseek', 'kimi', 'qwen']);

export const adminAiProviderParamSchema = z.object({
  params: z.object({
    provider: aiProviderSchema,
  }),
});

export const adminAiProviderSecretUpsertSchema = z.object({
  params: z.object({
    provider: aiProviderSchema,
  }),
  body: z.object({
    apiKey: z.string().trim().min(8, 'API key is required.').max(4000),
    model: z.string().trim().max(120).optional().nullable(),
    baseUrl: z.union([z.literal(''), z.string().url('Base URL must be valid.')]).optional().nullable(),
    confirmProvider: aiProviderSchema,
    reason: z.string().trim().min(8, 'Reason must be at least 8 characters.').max(500),
  }),
});

export const adminAiProviderSecretDeleteSchema = z.object({
  params: z.object({
    provider: aiProviderSchema,
  }),
  body: z.object({
    confirmProvider: aiProviderSchema,
    reason: z.string().trim().min(8, 'Reason must be at least 8 characters.').max(500),
  }),
});

export const adminAiProviderTestSchema = z.object({
  params: z.object({
    provider: aiProviderSchema,
  }),
  body: z.object({
    confirmProvider: aiProviderSchema,
  }),
});
