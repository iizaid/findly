import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');

const AI_ENV_BLOCK = [
  '# ============================================================',
  '# AI Providers - server-side only',
  '# ============================================================',
  'AI_ENABLED=false',
  'AI_STRICT_SECURITY_MODE=true',
  'AI_STORE_RAW_PAYLOADS=false',
  'AI_LOG_PROMPTS=false',
  'AI_LOG_RESPONSES=false',
  'AI_ALLOW_PROMPT_LOGGING_IN_PRODUCTION=false',
  '',
  'AI_DEFAULT_PROVIDER=gemini',
  'AI_DEFAULT_MODEL=gemini-2.5-flash',
  '',
  'AI_ANALYSIS_ENABLED=false',
  'AI_ANALYSIS_PROVIDER_CHAIN=gemini,openai,anthropic,deepseek,kimi,qwen,rule_based',
  'AI_ANALYSIS_TIMEOUT_MS=20000',
  'AI_ANALYSIS_MAX_RETRIES=1',
  'AI_ANALYSIS_CONCURRENCY=2',
  '',
  'GEMINI_API_KEY=',
  'GEMINI_DEFAULT_MODEL=gemini-2.5-flash',
  '',
  'OPENAI_API_KEY=',
  'OPENAI_DEFAULT_MODEL=gpt-4.1-mini',
  'OPENAI_BASE_URL=https://api.openai.com/v1',
  '',
  'ANTHROPIC_API_KEY=',
  'ANTHROPIC_DEFAULT_MODEL=claude-3-5-sonnet-latest',
  'ANTHROPIC_BASE_URL=https://api.anthropic.com/v1',
  '',
  'DEEPSEEK_API_KEY=',
  'DEEPSEEK_DEFAULT_MODEL=',
  'DEEPSEEK_BASE_URL=',
  '',
  'KIMI_API_KEY=',
  'KIMI_DEFAULT_MODEL=',
  'KIMI_BASE_URL=',
  '',
  'QWEN_API_KEY=',
  'QWEN_DEFAULT_MODEL=',
  'QWEN_BASE_URL=',
  '',
  '# Used only if dashboard-managed AI secrets are enabled.',
  '# Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
  'AI_SECRETS_MASTER_KEY=',
  'AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED=false',
];

const parseKey = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const index = trimmed.indexOf('=');
  if (index <= 0) return null;
  return trimmed.slice(0, index).trim();
};

const ensureEnvFile = () => {
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, '', 'utf8');
  }
};

ensureEnvFile();

const current = fs.readFileSync(envPath, 'utf8');
const existingKeys = new Set(current.split(/\r?\n/).map(parseKey).filter(Boolean));
const missingLines = [];
let previousWasBlank = true;

for (const line of AI_ENV_BLOCK) {
  const key = parseKey(line);
  if (key && existingKeys.has(key)) continue;
  if (!key && previousWasBlank && missingLines.length > 0) continue;
  missingLines.push(line);
  previousWasBlank = !key && line.trim() === '';
}

if (missingLines.length === 0) {
  console.log('AI env sync complete. No missing keys were added.');
  process.exit(0);
}

const prefix = current.trimEnd().length ? '\n\n' : '';
fs.writeFileSync(envPath, `${current.trimEnd()}${prefix}${missingLines.join('\n')}\n`, 'utf8');

const addedKeys = missingLines.map(parseKey).filter(Boolean);
console.log(`AI env sync complete. Added ${addedKeys.length} missing key names. Secret values were not printed.`);
