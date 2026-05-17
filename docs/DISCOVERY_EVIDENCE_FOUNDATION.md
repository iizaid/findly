# Discovery Evidence Foundation

Phase 3 adds an evidence-first discovery foundation while preserving Findly's local dataset cache.

## What Phase 3 Adds

- `DiscoveryQuery` records for planned or executed discovery work.
- `LeadEvidence` records for discovered clues before they become reusable lead data.
- `ValidationEvent` records for future validation decisions.
- `EnrichmentRun` records for future enrichment cost and field tracking.
- Source-target mapping so social platforms are treated as signal targets, not scrapers.
- Campaign budget guardrails for future external API usage.

## Findly Is Not A Scraper

Findly must not scrape Instagram, TikTok, Facebook, Reddit, or Google search pages directly. Social platforms are target signals: the user may want to find businesses with an Instagram or TikTok presence, but Findly should use compliant discovery methods such as local datasets, official APIs, or future paid search-result APIs.

## Unified Discovery Model

Findly no longer treats every platform as requiring its own direct API integration in the current roadmap. Social and directory platforms are target signals, while discovery methods are unified and separate.

Unified discovery flow:

1. LocalDataset / LeadCatalog first.
2. Existing Evidence cache second.
3. SerpAPI/search-result metadata discovery when Phase 4 live discovery is explicitly enabled and local coverage is insufficient.
4. Optional Google Places verification and local business discovery.
5. Website metadata enrichment for existing leads.

Official platform APIs can still be added later, but only as optional compliant adapters. Phase 4 can run SerpAPI as a search-result metadata provider behind `LIVE_SERP_DISCOVERY_ENABLED=true`; it still does not enable direct platform scraping.

| User selection | Meaning now | Live method now | Future method | Direct scraping? |
| --- | --- | --- | --- | --- |
| Instagram | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional official API later | No |
| TikTok | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional official API later | No |
| Facebook | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional official API later | No |
| Reddit | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional approved API later | No |
| Yelp | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional approved API later | No |
| TripAdvisor | Platform signal | LocalDataset first, SerpAPI metadata only if enabled and needed | SerpAPI metadata / optional approved API later | No |
| Google Maps | Local business source | Google Places if configured or LocalDataset fallback | Google Places | No |
| Website | Enrichment signal | Website metadata for existing leads | Website metadata | No |

## Core Concepts

Source target: what the user wants to find signals for, such as Instagram, Google Maps, website presence, or local dataset data.

Discovery method: how Findly searches safely, such as LocalDataset, CSV import, Google Places, future SerpAPI discovery, website metadata, or an approved official API.

Evidence: a small, sanitized discovered clue with provenance, confidence, retention, and optional links to a Lead, LeadCatalog row, campaign, and discovery query.

LeadCatalog: the reusable internal cache of known businesses. It remains the core local database.

Lead: a workspace-specific campaign result.

LeadListLead: a saved/search result item inside a lead list, often linked to either a Lead or a LeadCatalog row.

## Source Mapping

| User source | Target source | Discovery method | Adapter | Enabled now |
| --- | --- | --- | --- | --- |
| Google Maps | `GOOGLE_MAPS` | `GOOGLE_PLACES` | `GOOGLE_MAPS` | Yes, if configured |
| Instagram | `INSTAGRAM` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| TikTok | `TIKTOK` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| Facebook | `FACEBOOK` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| LinkedIn | `LINKEDIN` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| YouTube | `YOUTUBE` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| X | `X` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| Yelp | `YELP` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| TripAdvisor | `TRIPADVISOR` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| Website | `WEBSITE` | `WEBSITE_METADATA` | `WEBSITE` | Enrichment only |
| Reddit | `REDDIT` | `SERPAPI_DISCOVERY` if cache-first coverage requires it and SerpAPI is enabled | `SERPAPI` | Optional |
| Local Dataset | `LOCAL_DATASET` | `LOCAL_DATASET` | `LOCAL_DATASET` | Yes |
| CSV | `CSV` | `CSV_IMPORT` | `CSV` | Import only |

## Local Database Preservation

`LeadCatalog` remains the reusable internal cache. `LocalDatasetAdapter` still searches `LeadCatalog` and remains the cheapest first path. Admin CSV/XLSX imports still populate `LeadCatalog`, and duplicate detection remains based on the existing catalog/import logic.

Evidence is additive. Local dataset search results may create `LeadEvidence` linked to `catalogLeadId`, but they do not duplicate or replace catalog records.

## Evidence Retention

- SERP/social evidence: 30 days if not validated.
- Website metadata: 90 days.
- Google Places identity evidence: longer retention is allowed, but Google display fields should not be treated as permanent master data.
- Local dataset and CSV/import evidence: can be retained with the local catalog/import record.
- Copied social posts, comments, raw HTML, cookies, tokens, API keys, and auth headers must not be stored.

Snippets are stored as hashes by default. Metadata is redacted and truncated before storage.

## Cost Guardrails

Campaign filters may include:

```json
{
  "budget": {
    "maxDiscoveryCalls": 10,
    "maxEnrichmentCalls": 20,
    "maxAiAnalyses": 50,
    "maxEstimatedExternalCostMicrousd": 50000
  }
}
```

These guardrails do not charge real money. They prepare Findly to avoid accidental external API spend in later phases.

Phase 4 also supports:

```json
{
  "budget": {
    "maxSerpQueries": 5,
    "maxGooglePlacesQueries": 2,
    "maxExternalResults": 20
  },
  "discovery": {
    "minLocalCoverageRatio": 0.7,
    "minLocalAverageScore": 60,
    "forceLiveDiscovery": false,
    "disableLiveDiscovery": false
  }
}
```

## Still Disabled

- Instagram scraping.
- TikTok scraping.
- Facebook scraping.
- Reddit scraping.
- Browser automation.
- Payments.

## Future Readiness

This foundation prepares Findly to buy and add paid APIs later without data chaos. External discoveries should first become evidence, then validated/high-confidence evidence can later promote or update reusable `LeadCatalog` records.

## Next Phases

- Phase 5: Website metadata plus robots and sitemap upgrade.
- Phase 6: Selective Google Places enrichment and review queue.
