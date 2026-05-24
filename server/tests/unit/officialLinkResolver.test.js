import { describe, expect, it } from 'vitest';
import { resolveOfficialLinks } from '../../src/modules/search/officialLinkResolver.service.js';

describe('official link resolver', () => {
  it('keeps credible official links and drops unrelated social profiles', () => {
    const resolved = resolveOfficialLinks({
      candidate: {
        businessName: 'Amman Clinic',
        city: 'Amman',
        country: 'Jordan',
        websiteUrl: 'https://ammanclinic.com',
        sourceUrl: 'https://ammanclinic.com/contact',
      },
      contactExtraction: {
        instagramUrl: 'https://instagram.com/ammanclinic',
        facebookUrl: 'https://facebook.com/ammanclinic',
        linkedInUrl: 'https://linkedin.com/company/randomsoftware',
        sourceUrls: ['https://ammanclinic.com', 'https://ammanclinic.com/contact'],
      },
      evidenceItems: [
        { sourceUrl: 'https://ammanclinic.com' },
      ],
    });

    expect(resolved.websiteUrl).toBe('https://ammanclinic.com');
    expect(resolved.instagramUrl).toBe('https://instagram.com/ammanclinic');
    expect(resolved.facebookUrl).toBe('https://facebook.com/ammanclinic');
    expect(resolved.linkedInUrl).toBeNull();
  });
});
