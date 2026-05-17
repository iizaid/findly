# Search Metadata Provider Layer

Phase 4B makes live discovery vendor-neutral. Findly can use Serper.dev as the primary low-cost search metadata provider and SerpAPI as fallback without coupling campaign logic to either vendor.

## Why This Layer Exists

Platform selections such as Instagram, TikTok, Facebook, Reddit, Yelp, and TripAdvisor are target signals. They are not direct API integrations and they are not scraping targets. The provider layer lets Findly buy search metadata from compliant providers while keeping LocalDataset / LeadCatalog first.

## Local-First Flow

1. Search `LeadCatalog` through `LocalDatasetAdapter`.
2. Evaluate local coverage: result count, average score, selected signals, requested limit, freshness, and budget.
3. If local coverage is enough, skip Serper, SerpAPI, and Google Places.
4. If coverage is weak, use search metadata providers for platform/search signals.
5. Store provider results as `LeadEvidence`.
6. Promote high-confidence evidence into `LeadCatalog`.
7. Future searches can reuse promoted catalog records and avoid external calls.

## Providers

Primary provider: Serper.dev.

Fallback provider: SerpAPI.

Future placeholders can be added later, such as DataForSEO, Brave Search, or SearchAPI, without changing campaign business logic.

## Fallback Rules

- If live metadata discovery is disabled, no provider is called.
- If primary provider is not configured, Findly tries the configured fallback.
- If primary provider returns enough good results, fallback is not called.
- If primary provider fails, times out, rate-limits, or returns weak results, fallback can run if configured and budget allows.
- If all providers fail and local results exist, Findly returns local results with safe metadata.

## Quality Gate

Provider results are checked for:

- minimum result count
- average confidence
- unique links
- target platform match ratio
- location/category match signals

Defaults:

- `SEARCH_METADATA_MIN_PROVIDER_RESULTS=3`
- `SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE=55`
- minimum unique links: 2 when at least 2 results are requested

## Env Vars

```env
DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED=false
DISCOVERY_SECRETS_MASTER_KEY=

LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=false
SEARCH_METADATA_PROVIDER_PRIMARY=serper
SEARCH_METADATA_PROVIDER_FALLBACK=serpapi
SEARCH_METADATA_MAX_QUERIES_PER_CAMPAIGN=5
SEARCH_METADATA_MAX_QUERY_LENGTH=180
SEARCH_METADATA_MIN_PROVIDER_RESULTS=3
SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE=55

SERPER_API_KEY=
SERPER_BASE_URL=https://google.serper.dev/search
SERPER_TIMEOUT_MS=10000

SERPAPI_API_KEY=
SERPAPI_BASE_URL=https://serpapi.com/search.json
SERPAPI_TIMEOUT_MS=10000
```

Legacy compatibility:

- `LIVE_SERP_DISCOVERY_ENABLED=true` can still enable the SerpAPI-only path for older deployments.
- Prefer `LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=true` for Phase 4B.

Phase 4C adds optional dashboard-managed encrypted discovery provider keys. Active dashboard keys override env keys; env keys remain the fallback when dashboard secret management is disabled or no dashboard key exists.

## Budget Controls

Campaign budget can limit:

- `maxSerpQueries`
- `maxGooglePlacesQueries`
- `maxExternalResults`
- `maxEstimatedExternalCostMicrousd`

External provider calls are skipped when budget would be exceeded.

## Why This Is Not Social Scraping

Findly requests search-result metadata from a search metadata provider. It does not visit Instagram, TikTok, Facebook, Reddit, Yelp, or TripAdvisor pages. It does not log in, automate a browser, use proxies, scrape Google HTML, or store copied posts/comments.

## Manual QA

- Run a campaign with enough local data and confirm no external provider is called.
- Add a Serper key from the ROOT Discovery Providers dashboard and confirm only a fingerprint is visible.
- Enable `LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=true` with a Serper key.
- Run a low-coverage Instagram signal campaign and confirm Serper is used.
- Configure SerpAPI as fallback and test weak Serper results in a non-production test setup.
- Confirm `LeadEvidence` is created before promotion.
- Confirm repeated searches can reuse `LeadCatalog`.

## Still Disabled

- Direct Instagram/TikTok/Facebook/Reddit/Yelp/TripAdvisor APIs.
- Social scraping.
- Google Search HTML scraping.
- Browser automation.
- Login automation.
- Proxy scraping.
- Payments and billing.
