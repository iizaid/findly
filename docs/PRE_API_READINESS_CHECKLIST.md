# Pre-API Readiness Checklist

Phase 4 adds cache-first live discovery readiness. Findly still starts with LocalDataset / LeadCatalog and only calls paid metadata providers when local coverage is not enough, the provider is explicitly enabled, credentials exist, and campaign budget guardrails allow it. It does not enable payments, social scraping, browser automation, or direct platform APIs.

## Ready Now

- LocalDataset / LeadCatalog is the live first discovery path.
- Platform selections are treated as signal targets.
- Search metadata discovery can run only when explicitly enabled and a provider key is configured. Serper.dev is the preferred primary provider; SerpAPI remains fallback.
- Cache-first coverage checks skip SerpAPI when local results are enough.
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
3. If local coverage is enough, Findly returns local results and skips external calls.
4. If local coverage is not enough, the search metadata provider layer can fill missing results when the Phase 4B flag, provider key, quality gate, and budget allow it.
5. External metadata is recorded as `LeadEvidence` first, then high-confidence discoveries can be promoted into `LeadCatalog`.
6. Google Places can be used as an official local business source when configured and local Google Maps coverage is insufficient.
7. Website metadata remains enrichment for existing leads, not a standalone scraper.

## API Keys Needed Later

- AI provider key such as Gemini/OpenAI/Anthropic if AI-assisted analysis should be enabled.
- Google Places API key if Google Maps local business discovery should run live.
- Serper key for primary low-cost search metadata discovery.
- Optional SerpAPI key for fallback search metadata discovery.
- SMTP credentials for production email verification and password reset.

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
- Run a Local Dataset search.
- Run searches with Instagram, TikTok, Reddit, Yelp, and TripAdvisor signals.
- Check that results appear in Lead Lists.
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

## Known Disabled Items

- Payments.
- Direct platform APIs.
- Social scraping.

## Next Phase

Phase 5: Website metadata plus robots and sitemap upgrade.
