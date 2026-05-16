import { OpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class OpenAiProvider extends OpenAiCompatibleProvider {
  constructor(config = {}) {
    super({
      name: AI_PROVIDERS.OPENAI,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      defaultModel: config.defaultModel || 'gpt-4.1-mini',
      ...config,
    });
  }
}
