import { BaseAiProvider } from './baseProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class GeminiProvider extends BaseAiProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.GEMINI, ...config });
  }
}
