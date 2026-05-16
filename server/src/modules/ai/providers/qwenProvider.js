import { OpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class QwenProvider extends OpenAiCompatibleProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.QWEN, requiresBaseUrl: true, ...config });
  }
}
