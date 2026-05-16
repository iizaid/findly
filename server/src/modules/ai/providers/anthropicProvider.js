import { BaseAiProvider } from './baseProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class AnthropicProvider extends BaseAiProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.ANTHROPIC, ...config });
  }
}
