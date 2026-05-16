import { BaseAiProvider } from './baseProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class DeepseekProvider extends BaseAiProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.DEEPSEEK, ...config });
  }
}
