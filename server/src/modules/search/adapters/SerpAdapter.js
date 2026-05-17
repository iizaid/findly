import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class SerpAdapter extends BaseAdapter {
  static key = 'SERPAPI';
  static label = 'SerpAPI';
  static description = 'Future compliant search-result metadata adapter for evidence-first discovery.';
  static requiresApiKey = true;
  static comingSoon = true;
  static estimatedUseCase = 'Discover platform signals such as Instagram, TikTok, and Facebook through compliant search metadata. It must produce LeadEvidence first and must not scrape social platforms directly.';

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
      warnings: this.isConfigured() ? ['SerpAPI adapter is API-ready but execution is not connected yet.'] : ['SerpAPI key is not configured.'],
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'SerpAPI adapter is API-ready, but execution is not enabled until provider credentials and mapping are finalized.', 400);
  }
}
