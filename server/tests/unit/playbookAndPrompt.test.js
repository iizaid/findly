import { describe, it, expect, afterEach } from 'vitest';
import { getLeadAnalysisPlaybook, clearPlaybookCache } from '../../src/modules/ai/playbooks/playbookLoader.js';
import { buildLeadAnalysisPrompt } from '../../src/modules/ai/aiRequestBuilder.js';
import { leadAnalysisAiSchema } from '../../src/modules/ai/aiResponseValidator.js';

afterEach(() => {
  clearPlaybookCache();
});

describe('PlaybookLoader', () => {
  it('loads all required playbook files', () => {
    const playbook = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'Website Development' } });

    expect(playbook.systemPrompt).toBeTruthy();
    expect(playbook.systemPrompt).toContain('Lead Scoring');
    expect(playbook.rubric).toBeTruthy();
    expect(playbook.rubric.version).toBe('1.1.0');
    expect(playbook.rubric.dimensions).toBeDefined();
    expect(playbook.rubric.dimensions.serviceFit.weight).toBe(25);
    expect(playbook.styleGuide).toBeTruthy();
    expect(playbook.styleGuide).toContain('Maximum 3-4 sentences');
    expect(playbook.dataQualityPolicy).toBeTruthy();
    expect(playbook.dataQualityPolicy).toContain('confidence');
    expect(playbook.serviceMatchingPolicy).toBeTruthy();
    expect(playbook.serviceMatchingPolicy).toContain('Website Development');
    expect(playbook.antiHallucinationPolicy).toBeTruthy();
    expect(playbook.antiHallucinationPolicy).toContain('Never invent');
    expect(playbook.examples).toBeTruthy();
    expect(playbook.version).toBe('1.1.0');
  });

  it('loads service-specific examples for known services', () => {
    const services = [
      'Website Development',
      'Website Redesign',
      'Digital Menu',
      'Booking System',
      'E-commerce Store',
      'Automation',
      'SEO',
      'Social Media',
      'Branding Design',
      'Landing Page',
      'Thumbnail Design',
      'Digital Presence Improvement',
    ];

    for (const service of services) {
      const playbook = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: service } });
      expect(playbook.examples).toBeTruthy();
      expect(playbook.examples.serviceType || playbook.examples.service).toBeTruthy();
      clearPlaybookCache();
    }
  });

  it('falls back to generic examples for unknown service type', () => {
    const playbook = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'Quantum Computing Consulting' } });

    expect(playbook.examples).toBeTruthy();
    expect(playbook.examples.serviceType).toBe('Generic');
  });

  it('returns safe fallback when no serviceProfile is provided', () => {
    const playbook = getLeadAnalysisPlaybook({});

    expect(playbook.systemPrompt).toBeTruthy();
    expect(playbook.rubric).toBeTruthy();
    expect(playbook.examples).toBeTruthy();
  });

  it('caches playbook on second call', () => {
    const first = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'SEO' } });
    const second = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'SEO' } });

    expect(first.systemPrompt).toBe(second.systemPrompt);
    expect(first.rubric).toBe(second.rubric);
    expect(first.examples).toStrictEqual(second.examples);
  });

  it('clears cache correctly', () => {
    getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'SEO' } });
    clearPlaybookCache();
    // After clearing, should reload from disk on next call (no crash)
    const reloaded = getLeadAnalysisPlaybook({ serviceProfile: { serviceType: 'SEO' } });
    expect(reloaded.systemPrompt).toBeTruthy();
  });
});

describe('AI Prompt Builder with Playbook', () => {
  it('builds prompt that includes all playbook sections', () => {
    const { systemPrompt, userPrompt } = buildLeadAnalysisPrompt({
      lead: { businessName: 'Test Cafe', category: 'Cafe', city: 'Amman' },
      profile: { serviceType: 'Website Development' },
      campaign: { query: 'cafes in amman', country: 'Jordan', city: 'Amman' },
      ruleBasedAnalysis: { fitScore: 50, opportunityScore: 45, scoreLevel: 'MEDIUM', reasons: ['No website'] },
    });

    // System prompt should include all policy sections
    expect(systemPrompt).toContain('SCORING RUBRIC');
    expect(systemPrompt).toContain('SERVICE MATCHING POLICY');
    expect(systemPrompt).toContain('DATA QUALITY POLICY');
    expect(systemPrompt).toContain('ANTI-HALLUCINATION POLICY');
    expect(systemPrompt).toContain('OUTREACH STYLE GUIDE');
    expect(systemPrompt).toContain('FINAL INSTRUCTIONS');
    expect(systemPrompt).toContain('untrusted');
    expect(systemPrompt).toContain('JSON');

    // User prompt should include examples and input
    expect(userPrompt).toContain('SERVICE-SPECIFIC EXAMPLES');
    expect(userPrompt).toContain('INPUT DATA TO SCORE');
    expect(userPrompt).toContain('Test Cafe');
    expect(userPrompt).toContain('dimension');
  });

  it('prompt excludes secrets and internal labels', () => {
    const { systemPrompt, userPrompt } = buildLeadAnalysisPrompt({
      lead: {
        businessName: 'Test',
        source: 'LOCAL_DATASET',
        rawData: { secret: 'should-not-appear', apiKey: 'sk-12345' },
      },
      profile: { serviceType: 'Website Development' },
    });

    const fullPrompt = systemPrompt + userPrompt;
    expect(fullPrompt).not.toContain('LOCAL_DATASET');
    expect(fullPrompt).not.toContain('DATASET_IMPORT');
    expect(fullPrompt).not.toContain('sk-12345');
    expect(fullPrompt).not.toContain('apiKey');
  });

  it('handles missing profile gracefully', () => {
    const { systemPrompt, userPrompt } = buildLeadAnalysisPrompt({
      lead: { businessName: 'Test', category: 'Cafe' },
    });

    expect(systemPrompt).toBeTruthy();
    expect(userPrompt).toContain('Test');
  });
});

describe('AI Response Schema Validation', () => {
  it('rejects high confidence with low data quality', () => {
    const result = leadAnalysisAiSchema.safeParse({
      aiFitScore: 70,
      aiOpportunityScore: 75,
      scoreLevel: 'HIGH',
      shouldContact: true,
      contactPriority: 'HIGH',
      confidence: 'high',
      bestServiceToOffer: 'Website Development',
      whyThisLeadFits: ['Good'],
      whyThisLeadMayNotFit: [],
      detectedDigitalGaps: [],
      recommendedFirstOffer: 'Test offer',
      personalizedOutreachAngle: 'Test angle',
      messageDraft: 'Hi there',
      nextBestAction: 'Send message',
      riskNotes: [],
      dataQualityNotes: [],
      dimensionScores: {
        serviceFit: 80,
        digitalGap: 70,
        businessQuality: 60,
        contactability: 50,
        urgency: 40,
        dataQuality: 30, // Below 40
      },
      scoreExplanation: 'Test explanation.',
      missingDataThatWouldImproveDecision: [],
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes('confidence'))).toBe(true);
  });

  it('rejects URGENT priority with low service fit', () => {
    const result = leadAnalysisAiSchema.safeParse({
      aiFitScore: 30,
      aiOpportunityScore: 35,
      scoreLevel: 'LOW',
      shouldContact: false,
      contactPriority: 'URGENT',
      confidence: 'low',
      bestServiceToOffer: 'Test',
      whyThisLeadFits: [],
      whyThisLeadMayNotFit: ['Bad fit'],
      detectedDigitalGaps: [],
      recommendedFirstOffer: 'None',
      personalizedOutreachAngle: 'None',
      messageDraft: 'Test',
      nextBestAction: 'Skip',
      riskNotes: [],
      dataQualityNotes: [],
      dimensionScores: {
        serviceFit: 20, // Below 35
        digitalGap: 30,
        businessQuality: 25,
        contactability: 20,
        urgency: 15,
        dataQuality: 50,
      },
      scoreExplanation: 'Poor fit.',
      missingDataThatWouldImproveDecision: [],
    });

    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.includes('contactPriority'))).toBe(true);
  });

  it('accepts valid AI response with dimensionScores', () => {
    const result = leadAnalysisAiSchema.safeParse({
      aiFitScore: 75,
      aiOpportunityScore: 80,
      scoreLevel: 'HIGH',
      shouldContact: true,
      contactPriority: 'HIGH',
      confidence: 'high',
      bestServiceToOffer: 'Website Development',
      whyThisLeadFits: ['No website, strong reviews'],
      whyThisLeadMayNotFit: [],
      detectedDigitalGaps: ['No website'],
      recommendedFirstOffer: 'Simple business website',
      personalizedOutreachAngle: 'Lead with their strong reviews.',
      messageDraft: 'Hi, I noticed you have great reviews but no website.',
      nextBestAction: 'Send outreach message',
      riskNotes: [],
      dataQualityNotes: ['Good data quality.'],
      dimensionScores: {
        serviceFit: 85,
        digitalGap: 90,
        businessQuality: 75,
        contactability: 80,
        urgency: 60,
        dataQuality: 70,
      },
      scoreExplanation: 'Strong restaurant with no website, 4.6 rating and 220 reviews.',
      missingDataThatWouldImproveDecision: ['email address'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects dimension scores outside 0-100 range', () => {
    const result = leadAnalysisAiSchema.safeParse({
      aiFitScore: 75,
      aiOpportunityScore: 80,
      scoreLevel: 'HIGH',
      shouldContact: true,
      contactPriority: 'HIGH',
      confidence: 'medium',
      bestServiceToOffer: 'Website Development',
      whyThisLeadFits: [],
      whyThisLeadMayNotFit: [],
      detectedDigitalGaps: [],
      recommendedFirstOffer: 'Test',
      personalizedOutreachAngle: 'Test',
      messageDraft: 'Test',
      nextBestAction: 'Test',
      riskNotes: [],
      dataQualityNotes: [],
      dimensionScores: {
        serviceFit: 150, // Invalid
        digitalGap: 90,
        businessQuality: 75,
        contactability: 80,
        urgency: 60,
        dataQuality: 70,
      },
      scoreExplanation: 'Test',
      missingDataThatWouldImproveDecision: [],
    });

    expect(result.success).toBe(false);
  });
});
