import { AI_PROVIDERS, AI_TASKS } from './ai.types.js';

export const AI_MODEL_REGISTRY = {
  [AI_PROVIDERS.GEMINI]: {
    'gemini-2.5-flash': {
      tasks: [AI_TASKS.LEAD_ANALYSIS],
      supportsJson: true,
      defaultTemperature: 0.2,
      maxOutputTokens: 2000,
    },
  },
  [AI_PROVIDERS.OPENAI]: {
    'gpt-4.1-mini': {
      tasks: [AI_TASKS.LEAD_ANALYSIS, AI_TASKS.OUTREACH_MESSAGE, AI_TASKS.LEAD_LIST_SUMMARY],
      supportsJson: true,
      defaultTemperature: 0.2,
      maxOutputTokens: 2000,
    },
  },
  [AI_PROVIDERS.ANTHROPIC]: {
    'claude-3-5-sonnet-latest': {
      tasks: [AI_TASKS.LEAD_ANALYSIS, AI_TASKS.OUTREACH_MESSAGE, AI_TASKS.LEAD_LIST_SUMMARY],
      supportsJson: true,
      defaultTemperature: 0.2,
      maxOutputTokens: 2000,
    },
  },
};

