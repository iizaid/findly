# Findly AI Providers

Findly AI calls are server-side only. Do not put AI keys in frontend code, `VITE_`
variables, logs, screenshots, issue comments, or committed files.

## Enable AI locally

```bash
AI_ENABLED=true
AI_ANALYSIS_ENABLED=true
AI_ANALYSIS_PROVIDER_CHAIN=gemini,openai,anthropic,deepseek,kimi,qwen,rule_based
AI_ANALYSIS_TIMEOUT_MS=20000
AI_ANALYSIS_MAX_RETRIES=1
AI_ANALYSIS_CONCURRENCY=2
```

The final `rule_based` entry is important. If every provider is unavailable,
Findly keeps using the rule-based analyzer.

## Gemini

```bash
GEMINI_API_KEY=your_server_side_key
GEMINI_DEFAULT_MODEL=gemini-2.5-flash
```

Run a manual smoke test only when you intentionally want a real provider call:

```bash
RUN_REAL_AI_SMOKE=true npm run ai:smoke
```

Automated tests never make real AI calls.

## OpenAI

```bash
OPENAI_API_KEY=your_server_side_key
OPENAI_DEFAULT_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_BASE_URL` is optional for the official endpoint. Use HTTPS in production.

## Anthropic

```bash
ANTHROPIC_API_KEY=your_server_side_key
ANTHROPIC_DEFAULT_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
```

## OpenAI-compatible providers

DeepSeek, Kimi, and Qwen use the OpenAI-compatible adapter only when all required
server env vars are present:

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_DEFAULT_MODEL=
DEEPSEEK_BASE_URL=

KIMI_API_KEY=
KIMI_DEFAULT_MODEL=
KIMI_BASE_URL=

QWEN_API_KEY=
QWEN_DEFAULT_MODEL=
QWEN_BASE_URL=
```

Production rejects unsafe base URLs such as localhost, private IPs, and non-HTTPS
URLs. Base URLs must come from trusted server environment variables, not users.

## Security rules

- Never commit `.env` or real keys.
- Keep `AI_STORE_RAW_PAYLOADS=false`.
- Keep `AI_LOG_PROMPTS=false` and `AI_LOG_RESPONSES=false` in production.
- Do not send raw database objects to AI providers.
- Only minimized public business lead data may be sent.
- Provider errors are normalized before reaching application code.
- AI output never controls auth, roles, SQL, permissions, or billing.

## Admin status

Admin system status shows enabled flags, provider chain, model names, and provider
status values such as `configured`, `missing_key`, `misconfigured`, or
`degraded`. It must never show API keys, prompts, or raw responses.

## Smoke another provider

```bash
AI_SMOKE_PROVIDER=openai RUN_REAL_AI_SMOKE=true npm run ai:smoke
AI_SMOKE_PROVIDER=anthropic RUN_REAL_AI_SMOKE=true npm run ai:smoke
AI_SMOKE_PROVIDER=deepseek RUN_REAL_AI_SMOKE=true npm run ai:smoke
```

For OpenAI-compatible providers, set the provider key, model, and base URL first.
