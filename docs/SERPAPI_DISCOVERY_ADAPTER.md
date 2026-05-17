# SerpAPI Discovery Adapter

Phase 4 added SerpAPI as a controlled search-result metadata provider. Phase 4B keeps SerpAPI as fallback inside the vendor-neutral search metadata provider layer. Serper.dev is the preferred primary provider.

## What SerpAPI Does

- Runs only after LocalDataset / LeadCatalog coverage is evaluated and the provider registry selects SerpAPI.
- Uses SerpAPI Google search metadata for platform and directory signal targets such as Instagram, TikTok, Facebook, Reddit, Yelp, TripAdvisor, LinkedIn, YouTube, and X.
- Parses organic result metadata: title, link, displayed link, snippet, and position.
- Records sanitized `LeadEvidence` before any reusable catalog update.
- Promotes high-confidence evidence into `LeadCatalog` so future searches can reuse it locally.

## What SerpAPI Does Not Do

- It does not scrape Instagram, TikTok, Facebook, Reddit, Yelp, TripAdvisor, or Google HTML.
- It does not visit target result pages.
- It does not use browser automation, login automation, or proxies.
- It does not store full raw SERP responses, raw HTML, copied social posts, comments, cookies, tokens, or API keys.
- It does not bypass LocalDataset / LeadCatalog.

## Cache-First Flow

1. Search `LeadCatalog` through `LocalDatasetAdapter`.
2. Evaluate local coverage using requested limit, local count, average local score, and campaign overrides.
3. If local coverage is enough, return local results and skip external calls.
4. If local coverage is insufficient, check live discovery flags, provider keys, and campaign budget.
5. Run bounded Serper or SerpAPI queries only when allowed.
6. Normalize results into evidence candidates.
7. Store evidence and promote high-confidence discoveries into `LeadCatalog`.
8. Return a lead list containing local plus promoted external discoveries.

## When SerpAPI Is Called

SerpAPI can run only when all are true:

- `LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=true` with SerpAPI selected as primary/fallback, or legacy `LIVE_SERP_DISCOVERY_ENABLED=true`
- `SERPAPI_API_KEY` is configured server-side
- selected target sources map to search metadata discovery
- local coverage is not enough, or `forceLiveDiscovery=true`
- `disableLiveDiscovery` is not true
- campaign budget allows the query count and estimated cost

## When SerpAPI Is Skipped

- Local results satisfy cache-first coverage thresholds.
- The selected source is only `LOCAL_DATASET`.
- live search metadata discovery is disabled.
- Serper primary results pass the quality gate.
- `SERPAPI_API_KEY` is missing.
- Campaign budget blocks external discovery.
- Campaign filters set `discovery.disableLiveDiscovery=true`.

## Query Examples

- `site:instagram.com "coffee shops" "Amman" "Jordan"`
- `site:tiktok.com "restaurants" "Dubai" "UAE"`
- `site:reddit.com "web design" "looking for" "Jordan"`
- `site:yelp.com "salon" "Chicago" "United States"`
- `"restaurant" "Amman" "Jordan" "instagram"`

Queries are deduplicated and limited by `SEARCH_METADATA_MAX_QUERIES_PER_CAMPAIGN`, legacy `SERPAPI_MAX_QUERIES_PER_CAMPAIGN`, and campaign budget.

## Evidence Storage Rules

- Store source URL, title, snippet hash, minimal extracted fields, confidence score, and small sanitized metadata.
- Do not store full raw provider payloads.
- Do not store copied social content or raw HTML.
- Evidence is linked to `DiscoveryQuery` and can be linked to `LeadCatalog` after promotion.

## Promotion To LeadCatalog

High-confidence evidence can create or link a catalog record:

- Default promotion threshold: confidence score >= 65.
- Dedupe checks existing catalog records before creating a new one.
- Promoted records use the metadata provider source, such as `SERPER`, `SERPAPI`, or generic `SEARCH_METADATA`, and a stable source hash.
- Promotion creates a `ValidationEvent`.

## Budget Guardrails

Campaign filters can set:

```json
{
  "budget": {
    "maxSerpQueries": 5,
    "maxGooglePlacesQueries": 2,
    "maxExternalResults": 20,
    "maxEstimatedExternalCostMicrousd": 50000
  }
}
```

If budget is exceeded, Findly returns local results when available and marks external discovery as skipped.

## Required Env Vars

```env
LIVE_SERP_DISCOVERY_ENABLED=false
LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=false
SEARCH_METADATA_PROVIDER_PRIMARY=serper
SEARCH_METADATA_PROVIDER_FALLBACK=serpapi
SERPAPI_API_KEY=
SERPAPI_BASE_URL=https://serpapi.com/search.json
SERPAPI_TIMEOUT_MS=10000
SERPAPI_MAX_QUERIES_PER_CAMPAIGN=5
```

Keep these server-side only. Never expose the key through frontend `VITE_` variables.

## Manual QA Checklist

- Import or seed local data.
- Run a platform-signal search with enough local results and confirm SerpAPI is not called.
- Prefer `LIVE_SEARCH_METADATA_DISCOVERY_ENABLED=true` with a server-side Serper key and optional SerpAPI fallback key.
- Run a low-coverage platform-signal campaign.
- Confirm evidence is created.
- Confirm high-confidence evidence is promoted to `LeadCatalog`.
- Confirm repeated searches can reuse promoted catalog data.
- Confirm disabling live discovery returns local results without external calls.

## Cost Warning

SerpAPI calls may cost money. Keep query limits low, use cache-first defaults, and review campaign budget settings before enabling live discovery in production.
