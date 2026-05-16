import { OpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class DeepseekProvider extends OpenAiCompatibleProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.DEEPSEEK, requiresBaseUrl: true, ...config });
  }
}
