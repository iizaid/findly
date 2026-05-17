import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class SerpAdapter extends BaseAdapter {
  static key = 'SERPAPI';
  static label = 'Unified Search Metadata';
  static description = 'Future unified discovery method for compliant search-result metadata.';
  static requiresApiKey = true;
  static comingSoon = true;
  static estimatedUseCase = 'Target Instagram, TikTok, Facebook, Reddit, Yelp, TripAdvisor, and other platform signals through search metadata. It must produce LeadEvidence first and must not scrape platforms directly. Live execution remains disabled until Phase 4.';

  static isConfigured() {
    return Boolean(env.SERPAPI_API_KEY);
  }

  static estimateCost({ maxResults = env.SOURCE_MAX_RESULTS_DEFAULT } = {}) {
    const capped = Math.min(maxResults, env.SOURCE_MAX_RESULTS_HARD_LIMIT);
    return {
      baseCost: 5,
      perResultCost: 1,
      maxResults: capped,
      estimatedCredits: 5 + capped,
      warnings: this.isConfigured()
        ? ['Unified search metadata adapter is API-ready but live execution remains disabled until Phase 4.']
        : ['Unified search metadata discovery is planned for later; local cache is used now.'],
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Unified search metadata discovery is not enabled yet. Current campaigns use local cache first and produce LeadEvidence without live SerpAPI calls.', 400);
  }
}
