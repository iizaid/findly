import { z } from 'zod';
import { AI_ERROR_TYPES, AI_TASKS } from './ai.types.js';

const boundedString = z.string().trim().min(1).max(1200);
const boundedArray = z.array(boundedString).max(8).default([]);

export const leadAnalysisAiSchema = z.object({
  aiFitScore: z.number().int().min(0).max(100),
  aiOpportunityScore: z.number().int().min(0).max(100),
  scoreLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'GOLD']),
  shouldContact: z.boolean(),
  contactPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  confidence: z.enum(['low', 'medium', 'high']),
  bestServiceToOffer: boundedString.max(200),
  whyThisLeadFits: boundedArray,
  whyThisLeadMayNotFit: boundedArray,
  detectedDigitalGaps: boundedArray,
  recommendedFirstOffer: boundedString.max(500),
  personalizedOutreachAngle: boundedString.max(1000),
  messageDraft: boundedString.max(2000),
  nextBestAction: boundedString.max(500),
  riskNotes: boundedArray,
  dataQualityNotes: boundedArray,
  dimensionScores: z.object({
    serviceFit: z.number().int().min(0).max(100),
    digitalGap: z.number().int().min(0).max(100),
    businessQuality: z.number().int().min(0).max(100),
    contactability: z.number().int().min(0).max(100),
    urgency: z.number().int().min(0).max(100),
    dataQuality: z.number().int().min(0).max(100),
  }),
  scoreExplanation: boundedString.max(1000),
  missingDataThatWouldImproveDecision: boundedArray,
}).superRefine((data, ctx) => {
  if (data.dimensionScores.dataQuality < 40 && data.confidence === 'high') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Confidence cannot be high if data quality is below 40.',
      path: ['confidence'],
    });
  }
  if (data.dimensionScores.serviceFit < 35 && data.contactPriority === 'URGENT') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Contact priority cannot be URGENT if service fit is below 35.',
      path: ['contactPriority'],
    });
  }
});

const taskSchemas = {
  [AI_TASKS.LEAD_ANALYSIS]: leadAnalysisAiSchema,
};

export const parseJsonMaybe = (value) => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

export const validateAiTaskJson = ({ task, json, rawText }) => {
  const schema = taskSchemas[task];
  if (!schema) {
    return { ok: true, json: json ?? parseJsonMaybe(rawText) };
  }

  const parsedJson = json ?? parseJsonMaybe(rawText);
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      errorType: AI_ERROR_TYPES.INVALID_RESPONSE,
      safeMessage: 'AI provider returned an invalid structured response.',
      details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }

  return { ok: true, json: parsed.data };
};
