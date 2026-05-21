# Phase 4D: Source Intelligence Policy

## Overview
Findly's discovery engine is governed by the **Source Intelligence Policy**. This is a strict configuration matrix that defines the rules, risks, and allowed execution stages for every current and future data source.

## Guiding Principles
1. **No Scraping:** Direct platform scraping and browser automation are explicitly blocked from live discovery.
2. **Evidence-First:** Local and offline sources are always prioritized. Live paid discovery is the final fallback.
3. **Explicit Permissions:** Every source must be statically defined in `sourceIntelligencePolicy.service.js`.

## Core Categories
- **Local Memory:** Immediate local DB lookups (`LOCAL_DATASET`). Free.
- **Evidence Cache:** Reusable evidence from recent queries (`LEAD_EVIDENCE_CACHE`). Free.
- **Search Metadata:** Compliant SERP APIs for signal gathering (`SERPER`, `SERPAPI`). Paid/Low.
- **Official APIs:** Direct partner/official APIs (`GOOGLE_PLACES`). Paid/Medium.
- **Enrichment:** Targeted specific data retrieval (`WEBSITE_METADATA`).
- **Admin OSINT & Offline Imports:** High-risk, offline or admin-only tools (`SPIDERFOOT`, `COMMON_CRAWL`, `CSV_IMPORT`, `XLSX_IMPORT`, `JSON_IMPORT`, `HUGGING_FACE_DATASETS`). Blocked from live user discovery, reserved for backend admin operations or offline data merging.
- **Open Web Evidence:** Internal archived-public-web evidence (`OPEN_WEB_EVIDENCE`) that can assist runtime search and website enrichment without becoming a user-selectable source.

## Enforcement
The `assertSourceAllowedForStage` function checks the source policy before a source is used at a specific stage. If a source is not authorized for `LIVE_DISCOVERY` (for example Common Crawl dataset imports, Hugging Face datasets, SpiderFoot, Google Maps scraper output, CSV/XLSX/JSON imports, website metadata, or Snov.io), it is blocked from live user runtime.

This is intentionally different from the internal `OPEN_WEB_EVIDENCE` policy key. `OPEN_WEB_EVIDENCE` is the safe runtime abstraction used by the backend-only archived-public-web evidence layer. It is not exposed in the user source selector and is allowed only as an internal support layer in runtime search and website enrichment.

That does not mean those sources are bad data sources. It means they belong to different stages:
- Common Crawl: offline mining and controlled import semantics only when treated as a raw corpus/source policy.
- Open Web Evidence: runtime-safe archived-public-web support layer built on top of Common Crawl, hidden from user source selection.
- Hugging Face datasets: admin import/research only after license review.
- Google Maps scraper output: admin import only, never runtime scraping.
- SpiderFoot: admin research only.
- Website metadata: enrichment only.
- Snov.io: future email enrichment only.
- CSV/XLSX/JSON imports: admin import only.

Phase 4E exposes `JSON_IMPORT` for controlled admin/offline ingestion only. It does not make JSON an end-user runtime discovery source.

Phase 5 activates `WEBSITE_METADATA` only for the `WEBSITE_ENRICHMENT` stage. It can enrich an existing lead by safely fetching a single homepage and recording metadata evidence, but it remains blocked from `LIVE_DISCOVERY` and cannot create new leads by itself.

Live discovery runtime remains limited to approved search metadata providers such as `SERPER` and `SERPAPI`, with Google Places handled separately as an official local-business API stage.
