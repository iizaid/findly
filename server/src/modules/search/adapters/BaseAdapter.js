export class BaseAdapter {
  static key = 'BASE';
  static label = 'Base Adapter';
  static description = 'Shared adapter contract.';
  static requiresApiKey = false;
  static comingSoon = true;
  static estimatedUseCase = 'Internal contract only.';

  static isConfigured() {
    return false;
  }

  static getStatus() {
    const configured = this.isConfigured();
    const status = !configured && this.requiresApiKey
      ? 'not_configured'
      : (this.comingSoon ? 'coming_later' : (configured ? 'available' : 'not_configured'));
    return {
      key: this.key,
      label: this.label,
      description: this.description,
      status,
      configured,
      available: configured && !this.comingSoon,
      comingSoon: this.comingSoon,
      requiresApiKey: this.requiresApiKey,
      reason: configured && !this.comingSoon
        ? null
        : `${this.label} is ${!configured && this.requiresApiKey ? 'not configured yet' : 'adapter-ready but not enabled yet'}.`,
      estimatedUseCase: this.estimatedUseCase,
    };
  }

  static estimateCost({ maxResults = 20 } = {}) {
    return {
      baseCost: 0,
      perResultCost: 0,
      maxResults,
      estimatedCredits: 0,
      warnings: [],
    };
  }

  static validateInput(input) {
    return input;
  }

  constructor(campaign, context = {}) {
    this.campaign = campaign;
    this.context = context;
  }

  async search(_input, _context) {
    throw new Error('Not implemented');
  }

  normalize(_rawResult, _context) {
    throw new Error('Not implemented');
  }

  async run() {
    const input = this.constructor.validateInput(this.campaign);
    const rawResults = await this.search(input, this.context);
    return rawResults.map((result) => this.normalize(result, this.context));
  }
}
