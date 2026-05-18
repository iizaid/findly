import { z } from 'zod';
import { paginationQuerySchema } from '../../utils/pagination.js';

const datasetSourceTypeSchema = z.enum([
  'LOCAL_DATASET',
  'DATASET_IMPORT',
  'JSON_IMPORT',
  'CSV_IMPORT',
  'XLSX_IMPORT',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'GOOGLE_MAPS_SCRAPER_OUTPUT',
  'COMMON_CRAWL',
  'HUGGING_FACE_DATASETS',
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

export const adminWebsiteIntelligenceParamSchema = z.object({
  params: z.object({
    id: z.string().min(1).max(120),
  }),
});

export const adminWebsiteEnrichmentSchema = z.object({
  params: z.object({
    id: z.string().min(1).max(120),
  }),
  body: z.object({
    websiteUrl: z.string().trim().min(1).max(2000).optional(),
    forceRefresh: z.boolean().optional(),
  }).strict().optional().default({}),
});

// Fields an admin can map a source column to
export const ALLOWED_TARGET_FIELDS = new Set([
  'ignore',
  'businessName', 'category', 'country', 'governorate', 'city', 'address',
  'phone', 'whatsappNumber', 'email',
  'websiteUrl', 'instagramUrl', 'instagramUsername', 'facebookUrl', 'googleMapsUrl',
  'rating', 'reviewCount', 'latitude', 'longitude', 'notes', 'source', 'sourceUrl', 'sourceType',
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
    importMetadata: z.object({
      sourceName: z.string().trim().min(1).max(200).optional(),
      sourceUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
      sourcePolicyKey: z.enum([
        'LOCAL_DATASET',
        'CSV_IMPORT',
        'XLSX_IMPORT',
        'JSON_IMPORT',
        'MANUAL_ADMIN_IMPORT',
        'GOOGLE_MAPS_SCRAPER_OUTPUT',
        'COMMON_CRAWL',
        'HUGGING_FACE_DATASETS',
        'SPIDERFOOT',
      ]).optional(),
      acquisitionMethod: z.enum([
        'MANUAL_ADMIN_ENTRY',
        'CSV_UPLOAD',
        'XLSX_UPLOAD',
        'JSON_UPLOAD',
        'OFFLINE_TOOL_EXPORT',
        'OFFLINE_CORPUS_EXPORT',
        'LICENSED_DATASET_EXPORT',
        'INTERNAL_RESEARCH',
      ]).optional(),
      commercialUseAllowed: z.boolean().optional().nullable(),
      attributionRequired: z.boolean().optional().nullable(),
      licenseName: z.string().trim().max(200).optional().nullable(),
      licenseUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
      importedFromTool: z.string().trim().max(200).optional().nullable(),
      riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']).optional(),
      requiresManualReview: z.boolean().optional(),
      dataFreshness: z.string().trim().max(80).optional().nullable(),
      importPreset: z.enum([
        'generic_json',
        'google_maps_scraper_json',
        'google_maps_scraper_csv',
        'common_crawl_export_json',
        'hugging_face_dataset_export_json',
        'manual_admin_dataset',
        'generic_business_directory',
        'csv_dataset',
        'xlsx_dataset',
      ]).optional(),
      evidenceCreationMode: z.enum([
        'CATALOG_ONLY',
        'EVIDENCE_ONLY',
        'CREATE_EVIDENCE_AND_CATALOG',
        'NONE',
      ]).optional(),
      promoteToCatalogMode: z.enum([
        'ALL_VALID_ROWS',
        'HIGH_CONFIDENCE_ONLY',
        'MANUAL_REVIEW_REQUIRED',
        'NONE',
      ]).optional(),
    }).strict().optional().nullable(),
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
const discoveryProviderSchema = z.enum(['serper', 'serpapi', 'google_places', 'dataforseo', 'brave', 'searchapi']);

const isPublicHttpUrl = (urlStr) => {
  if (!urlStr) return true;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    
    const hostname = parsed.hostname.toLowerCase();
    
    const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    if ((hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') && isTestOrDev) {
      return true;
    }

    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.')
    ) {
      return false;
    }

    if (hostname.startsWith('172.')) {
      const parts = hostname.split('.');
      if (parts.length === 4) {
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
};

const safeUrlSchema = z.union([
  z.literal(''),
  z.string().url('Base URL must be valid.').refine(isPublicHttpUrl, { message: 'Base URL must be a public HTTPS or HTTP address.' })
]);

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
    baseUrl: safeUrlSchema.optional().nullable(),
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

export const adminDiscoveryProviderSecretUpsertSchema = z.object({
  params: z.object({
    provider: discoveryProviderSchema,
  }),
  body: z.object({
    apiKey: z.string().trim().min(8, 'API key is required.').max(4000),
    baseUrl: safeUrlSchema.optional().nullable(),
    role: z.enum(['SEARCH_METADATA', 'LOCAL_BUSINESS']).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    isPrimaryCandidate: z.boolean().optional(),
    isFallbackCandidate: z.boolean().optional(),
    confirmProvider: discoveryProviderSchema,
    reason: z.string().trim().min(8, 'Reason must be at least 8 characters.').max(500),
  }),
});

export const adminDiscoveryProviderSecretDeleteSchema = z.object({
  params: z.object({
    provider: discoveryProviderSchema,
  }),
  body: z.object({
    confirmProvider: discoveryProviderSchema,
    reason: z.string().trim().min(8, 'Reason must be at least 8 characters.').max(500),
  }),
});

export const adminDiscoveryProviderTestSchema = z.object({
  params: z.object({
    provider: discoveryProviderSchema,
  }),
  body: z.object({
    confirmProvider: discoveryProviderSchema,
  }),
});
