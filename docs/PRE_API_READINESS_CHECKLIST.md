# Pre-API Readiness Checklist

Phase 3C makes Findly stable and predictable before live paid discovery APIs are enabled. It does not enable live SerpAPI calls, payments, social scraping, browser automation, or direct platform APIs.

## Ready Now

- LocalDataset / LeadCatalog is the live first discovery path.
- Platform selections are treated as signal targets.
- Local searches can create `DiscoveryQuery` and `LeadEvidence` records.
- Lead lists, AI analysis, credits, password reset, admin import, and source mapping remain active.
- Admins can review a safe discovery readiness summary without exposing secrets.

## Still Disabled

- SerpAPI live discovery.
- Instagram, TikTok, Facebook, Reddit, Yelp, and TripAdvisor direct APIs.
- Social scraping, Google Search HTML scraping, login automation, browser automation, and proxies.
- Payments and billing.

## Current Discovery Flow

1. User chooses signal targets such as Instagram, TikTok, Reddit, Yelp, Google Maps, Website, or Local Dataset.
2. For platform and directory signals, Findly searches the local LeadCatalog today.
3. Results are saved into Lead Lists and evidence is recorded where applicable.
4. SerpAPI/search-result metadata can be activated in a future phase.
5. Google Places can be used as an official local business source when configured.
6. Website metadata remains enrichment for existing leads, not a standalone scraper.

## API Keys Needed Later

- AI provider key such as Gemini/OpenAI/Anthropic if AI-assisted analysis should be enabled.
- Google Places API key if Google Maps local business discovery should run live.
- SerpAPI key in Phase 4 for unified search-result metadata discovery.
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
- Keep SerpAPI disabled until Phase 4.

## Known Disabled Items

- SerpAPI live discovery.
- Payments.
- Direct platform APIs.
- Social scraping.

## Next Phase

Phase 4: SerpAPI Discovery Adapter.
