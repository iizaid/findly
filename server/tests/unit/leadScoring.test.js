import { describe, expect, it } from 'vitest';
import { buildLeadScoreBreakdown } from '../../src/modules/search/leadScoring.service.js';

describe('lead scoring', () => {
  it('produces different scores when evidence differs', () => {
    const campaign = {
      businessTypes: ['Clinics'],
      city: 'Amman',
      country: 'Jordan',
    };

    const strongLead = buildLeadScoreBreakdown({
      lead: {
        businessName: 'Amman Clinic',
        category: 'Medical Clinic',
        city: 'Amman',
        country: 'Jordan',
        instagramUrl: 'https://instagram.com/ammanclinic',
        phone: '+962799999999',
        reviewCount: 180,
        rating: 4.7,
      },
      campaign,
      sourceConfidence: 84,
    });

    const weakLead = buildLeadScoreBreakdown({
      lead: {
        businessName: 'Clinic Listing',
        category: 'Clinic',
        city: 'Zarqa',
        country: 'Jordan',
      },
      campaign,
      sourceConfidence: 35,
    });

    expect(strongLead.finalScore).toBeGreaterThan(weakLead.finalScore);
    expect(strongLead.dimensions.length).toBeGreaterThanOrEqual(12);
    expect(strongLead.dimensions.some((item) => item.key === 'data_quality')).toBe(true);
    expect(strongLead.dimensions.some((item) => item.key === 'geo_readiness')).toBe(true);
    expect(strongLead.scoringSource).toBe('RULE_BASED');
    expect(strongLead.dataQualityLevel).toBe('HIGH');
    expect(weakLead.dataQualityLevel).toBe('LOW');
  });

  it('rewards missing website for web opportunity searches', () => {
    const campaign = {
      businessTypes: ['Clinics'],
      city: 'Amman',
      country: 'Jordan',
    };

    const noWebsite = buildLeadScoreBreakdown({
      lead: {
        businessName: 'No Web Clinic',
        category: 'Clinic',
        city: 'Amman',
        country: 'Jordan',
      },
      campaign,
    });

    const withWebsite = buildLeadScoreBreakdown({
      lead: {
        businessName: 'Web Clinic',
        category: 'Clinic',
        city: 'Amman',
        country: 'Jordan',
        websiteUrl: 'https://webclinic.example',
      },
      campaign,
    });

    expect(
      noWebsite.dimensions.find((item) => item.key === 'website_gap')?.value,
    ).toBeGreaterThan(
      withWebsite.dimensions.find((item) => item.key === 'website_gap')?.value,
    );
  });

  it('does not let low-quality evidence score as a strong opportunity', () => {
    const campaign = {
      businessTypes: ['Cafes'],
      city: 'Amman',
      country: 'Jordan',
    };

    const weakLead = buildLeadScoreBreakdown({
      lead: {
        businessName: 'Basic Cafe Listing',
        category: 'Coffee Shop',
        city: 'Amman',
        country: 'Jordan',
        instagramUsername: 'basiccafe',
      },
      campaign,
      sourceConfidence: 58,
    });

    expect(weakLead.dataQualityLevel).toBe('LOW');
    expect(weakLead.finalScore).toBeLessThan(55);
  });
});
