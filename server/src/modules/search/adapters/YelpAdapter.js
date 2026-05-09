import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';

export class YelpAdapter extends BaseAdapter {
  static key = 'YELP';
  static label = 'Yelp Fusion';
  static description = 'Official Yelp Fusion API source for compliant business discovery.';
  static requiresApiKey = true;
  static comingSoon = true;
  static estimatedUseCase = 'Find local businesses from Yelp once an official Yelp API key is configured.';

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
      warnings: this.isConfigured() ? ['Yelp adapter is API-ready but execution is not connected yet.'] : ['Yelp API key is not configured.'],
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Yelp adapter is API-ready, but execution is not enabled until provider credentials and mapping are finalized.', 400);
  }
}
