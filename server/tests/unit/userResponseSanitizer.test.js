import { describe, expect, it } from 'vitest';
import { sanitizeLeadForUserResponse } from '../../src/modules/search/userResponseSanitizer.js';

describe('user response sanitizer analysis metadata', () => {
  it('preserves stored score dimensions with keys after reload', () => {
    const sanitized = sanitizeLeadForUserResponse({
      id: 'lead-1',
      source: 'WEBSITE',
      analyses: [{
        id: 'analysis-1',
        analysisSource: 'RULE_BASED',
        dataQualityLevel: 'MEDIUM',
        scoreDimensions: [
          {
            key: 'outreach_readiness',
            label: 'Outreach readiness',
            value: 68,
            weight: 1.2,
            reason: 'Phone and website are both available.',
          },
          {
            key: 'service_fit',
            label: 'Service fit',
            value: 72,
            weight: 1.1,
            reason: 'Business type matches the requested offer.',
          },
        ],
        reasons: [],
      }],
    });

    const [analysis] = sanitized.analyses;
    expect(analysis.dataQualityLevel).toBe('MEDIUM');
    expect(analysis.scoreDimensions[0]).toMatchObject({
      key: 'outreach_readiness',
      label: 'Outreach readiness',
      value: 68,
      weight: 1.2,
    });
    expect(analysis.scoreDimensions[1].key).toBe('service_fit');
  });

  it('rebuilds keys from legacy reason strings when stored dimensions are absent', () => {
    const sanitized = sanitizeLeadForUserResponse({
      id: 'lead-2',
      source: 'WEBSITE',
      analyses: [{
        id: 'analysis-2',
        detectedSignals: ['DATA_QUALITY_HIGH'],
        reasons: [
          'Outreach readiness: 77/100 - Verified phone and website.',
          'Contact path: 64/100 - Public contact page found.',
        ],
      }],
    });

    const [analysis] = sanitized.analyses;
    expect(analysis.dataQualityLevel).toBe('HIGH');
    expect(analysis.scoreDimensions.map((item) => item.key)).toEqual(
      expect.arrayContaining(['outreach_readiness', 'contact_path']),
    );
  });
});
