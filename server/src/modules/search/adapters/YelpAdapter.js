import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class YelpAdapter extends BaseAdapter {
  static key = 'YELP';
  static label = 'Yelp Signals';
  static description = 'Target Yelp-visible businesses using local data now and compliant search-result metadata or approved API access later.';
  static requiresApiKey = true;
  static comingSoon = true;
  static estimatedUseCase = 'Find businesses that appear to have Yelp visibility without direct platform scraping.';

  static isConfigured() {
    return Boolean(env.YELP_API_KEY);
  }

  static estimateCost({ maxResults = env.SOURCE_MAX_RESULTS_DEFAULT } = {}) {
    const capped = Math.min(maxResults, env.SOURCE_MAX_RESULTS_HARD_LIMIT);
    return {
      baseCost: 5,
      perResultCost: 1,
      maxResults: capped,
      estimatedCredits: 5 + capped,
      warnings: this.isConfigured()
        ? ['Yelp signal discovery is credential-ready but execution is not connected yet.']
        : ['Yelp signal discovery uses local cache now; no direct API key is required for current fallback behavior.'],
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Yelp signal discovery is not enabled for live execution. Current campaigns use local cache first; future discovery may use compliant search metadata or an approved API.', 400);
  }
}
