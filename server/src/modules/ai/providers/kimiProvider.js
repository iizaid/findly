import { OpenAiCompatibleProvider } from './openAiCompatibleProvider.js';
import { AI_PROVIDERS } from '../ai.types.js';

export class KimiProvider extends OpenAiCompatibleProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.KIMI, requiresBaseUrl: true, ...config });
  }
}
