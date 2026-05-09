import { BaseAdapter } from './BaseAdapter.js';
import { enrichWebsiteUrl } from '../websiteEnrichment.service.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class WebsiteAdapter extends BaseAdapter {
  static key = 'WEBSITE';
  static label = 'Website Enrichment';
  static description = 'Safe public homepage metadata enrichment for leads that already have a website URL.';
  static requiresApiKey = false;
  static comingSoon = false;
  static estimatedUseCase = 'Extract public homepage metadata, CTA hints, contact hints, and weak website signals.';

  static isConfigured() {
    return true;
  }

  static estimateCost() {
    return {
      baseCost: 0,
      perResultCost: 0,
      maxResults: 1,
      estimatedCredits: 0,
      warnings: ['Website enrichment is not a campaign discovery source. It enriches existing leads only.'],
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website enrichment is available for existing leads, not as a campaign search source.', 400);
  }

  async enrich(lead) {
    if (!lead.websiteUrl) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Lead does not have a website URL to enrich.', 400);
    }

    return enrichWebsiteUrl(lead.websiteUrl);
  }
}
