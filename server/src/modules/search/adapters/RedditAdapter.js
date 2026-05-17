import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';
import { fetchJsonWithTimeout } from '../../../utils/httpClient.js';
import { detectSignalIntent, hashPublicAuthor } from '../opportunitySignal.service.js';

const DEFAULT_KEYWORDS = [
  'need website',
  'web designer',
  'online menu',
  'booking system',
  'small business website',
  'freelancer needed',
];

export class RedditAdapter extends BaseAdapter {
  static key = 'REDDIT';
  static label = 'Reddit Signals';
  static description = 'Target Reddit discussion or demand signals using local data now and compliant search-result metadata or approved API access later.';
  static requiresApiKey = true;
  static requiresApproval = true;
  static comingSoon = false;
  static estimatedUseCase = 'Find Reddit-visible opportunities without direct scraping or unapproved commercial access.';

  static isConfigured() {
    return Boolean(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USER_AGENT && env.REDDIT_REFRESH_TOKEN);
  }

  static getStatus() {
    const configured = this.isConfigured();
    return {
      key: this.key,
      label: this.label,
      description: this.description,
      status: configured ? 'requires_approval' : 'not_configured',
      configured,
      available: false,
      comingSoon: false,
      requiresApiKey: true,
      requiresApproval: true,
      reason: configured
        ? 'Reddit is treated as a target signal. Approved API access may become an optional future adapter, but live campaign execution uses local cache now.'
        : 'Reddit is treated as a target signal. Current live discovery uses local cache; future discovery may use compliant search metadata or approved API access.',
      estimatedUseCase: this.estimatedUseCase,
    };
  }

  static estimateCost({ maxResults = env.REDDIT_MAX_RESULTS_DEFAULT } = {}) {
    const capped = Math.min(maxResults, env.REDDIT_MAX_RESULTS_HARD_LIMIT);
    return {
      baseCost: 5,
      perResultCost: 1,
      maxResults: capped,
      estimatedCredits: 5 + capped,
      warnings: this.isConfigured()
        ? ['Reddit signal discovery is credential-ready but remains disabled until compliant execution is explicitly approved.']
        : ['Reddit signal discovery uses local cache now; no direct API key is required for current fallback behavior.'],
    };
  }

  static validateInput(input) {
    const filters = input.filters || {};
    return {
      keywords: Array.isArray(filters.keywords) && filters.keywords.length > 0 ? filters.keywords : DEFAULT_KEYWORDS,
      serviceKeywords: Array.isArray(input.businessTypes) ? input.businessTypes : [],
      locationKeywords: [input.city, input.country].filter(Boolean),
      subreddits: Array.isArray(filters.subreddits) ? filters.subreddits.slice(0, 10) : [],
      sort: ['relevance', 'hot', 'top', 'new', 'comments'].includes(filters.sort) ? filters.sort : 'relevance',
      timeRange: ['hour', 'day', 'week', 'month', 'year', 'all'].includes(filters.timeRange) ? filters.timeRange : 'month',
      maxResults: Math.min(input.requestedLimit || env.REDDIT_MAX_RESULTS_DEFAULT, env.REDDIT_MAX_RESULTS_HARD_LIMIT),
      excludeNsfw: filters.excludeNsfw !== false,
    };
  }

  async run() {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Reddit adapter is compliant-foundation ready, but execution is disabled until approved API access is configured and explicitly enabled.', 400);
  }

  async getAccessToken() {
    if (!this.constructor.isConfigured()) {
      throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'Reddit API credentials are not configured.', 400);
    }

    const basic = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64');
    const data = await fetchJsonWithTimeout(env.REDDIT_ACCESS_TOKEN_URL, {
      method: 'POST',
      timeoutMs: env.REDDIT_REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': env.REDDIT_USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.REDDIT_REFRESH_TOKEN,
      }).toString(),
    });

    if (!data.access_token) {
      throw new AppError(errorCodes.PROVIDER_AUTH_FAILED, 'Reddit authentication failed.', 502);
    }

    return data.access_token;
  }

  normalize(rawPost, context = {}) {
    const data = rawPost.data || rawPost;
    const title = data.title || '';
    const snippet = data.selftext ? data.selftext.slice(0, 500) : null;
    const intent = detectSignalIntent({
      title,
      body: data.selftext || '',
      keywords: context.keywords || DEFAULT_KEYWORDS,
      serviceKeywords: context.serviceKeywords || [],
      locationKeywords: context.locationKeywords || [],
    });

    return {
      source: 'REDDIT',
      sourceId: data.id || data.name,
      sourceUrl: data.permalink ? `https://www.reddit.com${data.permalink}` : null,
      title,
      snippet,
      authorHash: hashPublicAuthor(data.author),
      subreddit: data.subreddit || null,
      postedAt: data.created_utc ? new Date(data.created_utc * 1000) : null,
      score: Number.isFinite(data.score) ? data.score : null,
      commentCount: Number.isFinite(data.num_comments) ? data.num_comments : null,
      matchedKeywords: intent.matchedKeywords,
      detectedIntent: intent.detectedIntent,
      confidence: intent.confidence,
      rawData: {
        id: data.id,
        subreddit: data.subreddit,
        permalink: data.permalink,
        score: data.score,
        num_comments: data.num_comments,
        over_18: data.over_18,
      },
    };
  }
}
