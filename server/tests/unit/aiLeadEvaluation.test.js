import { describe, it, expect } from 'vitest';
import { buildLeadAnalysisPrompt } from '../../src/modules/ai/aiRequestBuilder.js';
import { leadAnalysisAiSchema } from '../../src/modules/ai/aiResponseValidator.js';
import { mergeRuleBasedAndAiAnalysis } from '../../src/modules/ai/leadAnalysisAi.service.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = join(__dirname, '../fixtures/aiLeadEvaluationCases.json');
const testCases = JSON.parse(readFileSync(casesPath, 'utf8'));

describe('AI Playbook offline evaluation', () => {
  it('prompt builder includes expected service-specific examples', () => {
    const devCase = testCases.find(c => c.id === 'case-1-strong-website-dev');
    const prompt = buildLeadAnalysisPrompt({ lead: devCase.lead, profile: devCase.profile });
    expect(prompt.userPrompt).toContain('SERVICE-SPECIFIC EXAMPLES');
    expect(prompt.userPrompt).toContain('Website Development');
  });

  it('schema rejects inconsistent AI outputs', () => {
    const invalidOutput = {
      aiFitScore: 80,
      aiOpportunityScore: 90,
      scoreLevel: 'GOLD',
      shouldContact: true,
      contactPriority: 'URGENT',
      confidence: 'high',
      bestServiceToOffer: 'Website',
      whyThisLeadFits: ['Good'],
      whyThisLeadMayNotFit: [],
      detectedDigitalGaps: ['No website'],
      recommendedFirstOffer: 'Free site',
      personalizedOutreachAngle: 'Hey',
      messageDraft: 'Hi',
      nextBestAction: 'Call',
      riskNotes: [],
      dataQualityNotes: [],
      dimensionScores: {
        serviceFit: 30, // Too low for URGENT
        digitalGap: 90,
        businessQuality: 80,
        contactability: 80,
        urgency: 80,
        dataQuality: 80,
      },
      scoreExplanation: 'Explanation',
      missingDataThatWouldImproveDecision: [],
    };
    
    const result = leadAnalysisAiSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain('Contact priority cannot be URGENT');
  });

  it('schema rejects GOLD scoreLevel if opportunity score is low', () => {
    const invalidOutput = {
      aiFitScore: 80,
      aiOpportunityScore: 70, // Too low for GOLD
      scoreLevel: 'GOLD',
      shouldContact: true,
      contactPriority: 'HIGH',
      confidence: 'medium',
      bestServiceToOffer: 'Website',
      whyThisLeadFits: ['Good'],
      whyThisLeadMayNotFit: [],
      detectedDigitalGaps: ['No website'],
      recommendedFirstOffer: 'Free site',
      personalizedOutreachAngle: 'Hey',
      messageDraft: 'Hi',
      nextBestAction: 'Call',
      riskNotes: [],
      dataQualityNotes: [],
      dimensionScores: {
        serviceFit: 80,
        digitalGap: 90,
        businessQuality: 80,
        contactability: 80,
        urgency: 80,
        dataQuality: 80,
      },
      scoreExplanation: 'Explanation',
      missingDataThatWouldImproveDecision: [],
    };
    
    const result = leadAnalysisAiSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain('aiOpportunityScore must be >= 85 for GOLD');
  });

  it('merge does not create GOLD from weak data', () => {
    const ruleBased = { fitScore: 80, opportunityScore: 90, detectedSignals: [], reasons: [] };
    const aiAnalysis = {
      aiFitScore: 90,
      aiOpportunityScore: 95,
      confidence: 'high',
      dimensionScores: { dataQuality: 30 } // LOW data quality
    };
    const merged = mergeRuleBasedAndAiAnalysis({ ruleBasedAnalysis: ruleBased, aiAnalysis });
    expect(merged.scoreLevel).not.toBe('GOLD');
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(merged.scoreLevel);
  });
});
