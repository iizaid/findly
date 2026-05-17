# Discovery Provider Secret Management

Phase 4C adds encrypted dashboard-managed secrets for discovery providers. It mirrors the AI provider secret vault while keeping search discovery local-first and evidence-first.

## Supported Providers

- Serper.dev: primary low-cost search metadata provider.
- SerpAPI: fallback search metadata provider.
- Google Places: optional official local business provider for Google Maps intent.
- DataForSEO, Brave, and SearchAPI: future placeholders only.

Direct Instagram, TikTok, Facebook, Reddit, Yelp, and TripAdvisor APIs are still not required. Social scraping, browser automation, login automation, and proxy scraping remain disabled.

## Required Server Env

```env
DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED=false
DISCOVERY_SECRETS_MASTER_KEY=

LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=false
SEARCH_METADATA_PROVIDER_PRIMARY=serper
SEARCH_METADATA_PROVIDER_FALLBACK=serpapi
```

`DISCOVERY_SECRETS_MASTER_KEY` should be a 32-byte base64 or hex key. If it is not set, the vault can fall back to `AI_SECRETS_MASTER_KEY` only when dashboard discovery secret management is explicitly enabled.

Generate a key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Dashboard Override Rules

Provider config is resolved in this order:

1. Active dashboard-managed encrypted key.
2. Server environment variable key.
3. Missing/not configured.

Dashboard keys override env keys only while `DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED=true` and the provider secret is active. If dashboard management is disabled, existing env keys continue to work.

## Access Model

- Admins can view safe provider status.
- ROOT users can add, replace, delete, and test dashboard-managed keys.
- Provider tests are rate limited.
- All writes and tests are audit logged without plaintext keys.

Status responses may include provider, source, fingerprint, role, priority, last test status, and whether a base URL is configured. They never include raw API keys.

## Encryption And Fingerprints

Keys are encrypted at rest with AES-256-GCM. The database stores only:

- encrypted key payload
- short SHA-256 fingerprint
- provider metadata
- last safe test status

Plaintext keys are used only inside backend provider calls and are never returned to the frontend.

## Base URL Safety

Discovery provider base URLs are allowlisted:

- Serper: `https://google.serper.dev/search`
- SerpAPI: `https://serpapi.com/search.json`
- Google Places: official Places text search endpoint

Arbitrary custom URLs, localhost, private network hosts, and non-HTTPS URLs are rejected. This prevents SSRF-style misuse from dashboard forms.

## Provider Testing

ROOT can run a tiny connectivity test from the dashboard. Tests use provider-specific safe requests and return only:

- ok
- provider
- latency
- validation status
- safe error type/message if failed

Tests do not use user lead data and do not return raw provider responses.

## Discovery Flow Remains Local First

1. Search `LeadCatalog` through LocalDataset.
2. Reuse evidence/cache where available.
3. Use Serper only if local coverage is insufficient and live discovery is enabled.
4. Use SerpAPI only if Serper fails or returns weak results.
5. Use Google Places only for Google Maps/local business intent.
6. Store external findings as `LeadEvidence` before promotion to `LeadCatalog`.

## What Must Never Be Exposed

- API keys
- secret master keys
- provider request URLs containing key parameters
- raw provider responses
- raw prompts or AI payloads
- cookies, tokens, sessions, or auth headers

## Manual QA

- Enable dashboard discovery secret management with a generated master key.
- Log in as ROOT.
- Open Admin -> Discovery Providers.
- Add a Serper key and confirm only a fingerprint is shown.
- Test Serper and confirm no raw key appears in the response.
- Add optional SerpAPI fallback.
- Run a campaign with enough local data and confirm no external provider is used.
- Run a low-coverage campaign with live discovery enabled and confirm Serper is used before SerpAPI fallback.
