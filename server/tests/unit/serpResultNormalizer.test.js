import { describe, expect, it } from 'vitest';
import {
  extractUsernameFromUrl,
  inferBusinessNameFromTitle,
  inferTargetSourceFromUrl,
  normalizeSerpResult,
} from '../../src/modules/search/serpResultNormalizer.service.js';

const campaign = {
  businessTypes: ['Coffee Shop'],
  city: 'Amman',
  country: 'Jordan',
};

describe('Serp result normalizer', () => {
  it('infers target source and extracts usernames from safe URLs', () => {
    expect(inferTargetSourceFromUrl('https://www.instagram.com/example_cafe/')).toBe('INSTAGRAM');
    expect(extractUsernameFromUrl('https://www.instagram.com/example_cafe/', 'INSTAGRAM')).toBe('example_cafe');
    expect(inferTargetSourceFromUrl('javascript:alert(1)')).toBeNull();
  });

  it('infers business names from titles', () => {
    expect(inferBusinessNameFromTitle('Example Cafe | Instagram')).toBe('Example Cafe');
  });

  it('normalizes organic result metadata without storing full response', () => {
    const normalized = normalizeSerpResult({
      result: {
        title: 'Example Coffee Shop Amman | Instagram',
        link: 'https://instagram.com/example_cafe',
        displayed_link: 'instagram.com/example_cafe',
        snippet: 'Coffee shop in Amman Jordan',
        position: 1,
      },
      targetSource: 'INSTAGRAM',
      campaign,
    });

    expect(normalized).toMatchObject({
      targetSource: 'INSTAGRAM',
      discoveryMethod: 'SERPAPI_DISCOVERY',
      sourceType: 'SERPAPI_ORGANIC_RESULT',
      externalId: expect.any(String),
    });
    expect(normalized.extractedFields.platformUsername).toBe('example_cafe');
    expect(normalized.confidenceScore).toBeGreaterThanOrEqual(65);
    expect(normalized.confidenceReasons).toContain('TARGET_PLATFORM_MATCH');
    expect(normalized.rawMetadata).not.toHaveProperty('snippet');
  });

  it('rejects malformed result URLs', () => {
    expect(normalizeSerpResult({
      result: { title: 'Bad', link: 'file:///etc/passwd', snippet: 'bad' },
      targetSource: 'INSTAGRAM',
      campaign,
    })).toBeNull();
  });
});
