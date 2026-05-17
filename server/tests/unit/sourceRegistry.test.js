import { describe, expect, it } from 'vitest';
import { getSourceStatusByKey } from '../../src/modules/search/source.registry.js';

describe('source registry signal language', () => {
  it('presents coming-later social and directory sources as signal targets', () => {
    for (const key of ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'TRIPADVISOR', 'YOUTUBE', 'X']) {
      const status = getSourceStatusByKey(key);
      const text = `${status.label} ${status.description} ${status.reason} ${status.estimatedUseCase}`;

      expect(status.group).toBe('platform_signal');
      expect(text).toContain('target signal');
      expect(text).toContain('local cache');
      expect(text).not.toContain('Requires official compliant integration');
      expect(text).not.toContain('Requires compliant provider access before use');
      expect(text.toLowerCase()).not.toContain('login automation');
    }
  });

  it('does not present Reddit, Yelp, or SerpAPI as active direct campaign integrations', () => {
    for (const key of ['REDDIT', 'YELP', 'SERPAPI']) {
      const status = getSourceStatusByKey(key);
      const text = `${status.label} ${status.description} ${status.reason || ''} ${status.estimatedUseCase}`;

      expect(status.available).toBe(false);
      expect(text).not.toContain('official API key is configured');
      expect(text).not.toContain('API credentials are not configured');
      expect(text).toMatch(/signal|metadata|local cache/i);
    }
  });
});
