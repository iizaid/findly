# Pre-API Readiness Checklist

Phase 4 adds cache-first live discovery readiness. Findly still starts with LocalDataset / LeadCatalog and only calls paid metadata providers when local coverage is not enough, the provider is explicitly enabled, credentials exist, and campaign budget guardrails allow it. It does not enable payments, social scraping, browser automation, or direct platform APIs.

## Ready Now

- LocalDataset / LeadCatalog is the live first discovery path.
- Platform selections are treated as signal targets.
- Search metadata discovery can run only when explicitly enabled and a provider key is configured. Serper.dev is the preferred primary provider; SerpAPI remains fallback.
- Serper, SerpAPI, and Google Places keys can be managed from the ROOT Discovery Providers dashboard when encrypted discovery secret management is enabled. Server env keys still work as fallback.
- Cache-first coverage checks skip SerpAPI when local results are enough.
- Evidence cache is checked before paid providers. Linked evidence can be reused in lead lists; unlinked evidence is reported but not inserted as a ghost result.
- Smart query budgeting reduces Serper/SerpAPI calls as local plus linked evidence coverage improves.
- Admin imports support controlled CSV, XLSX, and JSON ingestion with source policy metadata and optional linked LeadEvidence creation.
- Existing leads can be enriched with safe homepage website metadata. This records conversion-path and digital-presence signals as `LeadEvidence` without crawling or storing raw HTML.
- Admins can view and refresh website intelligence from the catalog lead detail panel. The workflow is admin-only, CSRF-protected for refreshes, and returns sanitized metadata/signals only.
- Admins can create controlled website enrichment jobs for small capped batches of existing catalog leads. Jobs reuse recent `WEBSITE_METADATA` evidence, expose only safe progress summaries, and do not create new leads.
- Google, GitHub, and Discord OAuth can be enabled as backend-only identity providers. OAuth uses the existing Findly session cookie, requires verified provider emails, and does not store provider tokens.
- Local searches can create `DiscoveryQuery` and `LeadEvidence` records.
- Lead lists, AI analysis, credits, password reset, admin import, and source mapping remain active.
- Admins can review a safe discovery readiness summary without exposing secrets.

## Still Disabled

- Instagram, TikTok, Facebook, Reddit, Yelp, and TripAdvisor direct APIs.
- Social scraping, Google Search HTML scraping, login automation, browser automation, and proxies.
- Payments and billing.

## Current Discovery Flow

1. User chooses signal targets such as Instagram, TikTok, Reddit, Yelp, Google Maps, Website, or Local Dataset.
2. For platform and directory signals, Findly searches the local LeadCatalog first.
3. Findly checks reusable `LeadEvidence` before paid providers.
4. If local plus linked evidence coverage is enough, Findly returns those results and skips external calls.
5. If local coverage is still short, the backend-only Open Web Evidence Layer can try archived public-web evidence before paid providers.
6. If coverage is still not enough, the search metadata provider layer can fill missing results when the Phase 4B flag, provider key, quality gate, source policy, and budget allow it.
7. External metadata is recorded as `LeadEvidence` first, then high-confidence discoveries can be promoted into `LeadCatalog`.
8. Google Places can be used as an official local business source when configured and local Google Maps coverage is insufficient.
9. Website metadata remains enrichment for existing leads, not a standalone scraper.
10. Website enrichment checks recent `WEBSITE_METADATA` evidence before refetching the same normalized URL and can use Open Web Evidence before a live homepage fetch when enabled.
11. Website enrichment jobs process one capped batch of existing catalog leads at a time and store status in durable job records.

## API Keys Needed Later

- AI provider key such as Gemini/OpenAI/Anthropic if AI-assisted analysis should be enabled.
- Google Places API key if Google Maps local business discovery should run live.
- Serper key for primary low-cost search metadata discovery.
- Optional SerpAPI key for fallback search metadata discovery.
- SMTP credentials for production email verification and password reset.
- OAuth client IDs/secrets for Google, GitHub, or Discord only when those sign-in providers are enabled.

## APIs Not Needed Now

- Instagram API.
- TikTok API.
- Facebook API.
- Reddit API.
- Yelp API.
- TripAdvisor API.

These platforms are target signals now. Findly does not need direct access to them for the current local-cache discovery model.

## Manual QA Checklist

- Register a new account.
- Verify email.
- Log in.
- Import a CSV/XLSX dataset as admin.
- Import a small JSON dataset as admin with source policy metadata.
- Run a Local Dataset search.
- Run searches with Instagram, TikTok, Reddit, Yelp, and TripAdvisor signals.
- Check that results appear in Lead Lists.
- As admin, open a catalog lead with a website URL and run Website Intelligence from the detail panel.
- As admin, create a Website Jobs run for recent catalog leads, process the next batch, and confirm only safe status/signals are shown.
- Analyze one lead and confirm AI fallback is safe if providers are unavailable.
- Reset password and confirm old sessions are revoked.
- Log out.

## Deployment Checklist

- Review production environment variables.
- Confirm Prisma migrations are applied.
- Seed or import local LeadCatalog data.
- Test SMTP delivery.
- Test AI provider key from the ROOT admin panel if AI is enabled.
- Add Google Places only if live Maps discovery is desired.
- Enable live search metadata only after setting `SERPER_API_KEY`, optional `SERPAPI_API_KEY`, reviewing query limits, and confirming budget limits.
- Alternatively, enable `DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED=true`, set `DISCOVERY_SECRETS_MASTER_KEY`, then add Serper/SerpAPI/Google Places keys from the ROOT dashboard.

## Known Disabled Items

- Payments.
- Direct platform APIs.
- Social scraping.
- Google Maps scraping inside SaaS runtime.
- Browser automation, login automation, and proxy scraping.
- Full website crawling and JavaScript browser rendering.

## Next Phase

Phase 5D: opportunity recommendation polish and private-beta operational monitoring.
