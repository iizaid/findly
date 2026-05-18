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
- **Admin OSINT & Offline Imports:** High-risk, offline or admin-only tools (`SPIDERFOOT`, `COMMON_CRAWL`, `CSV_IMPORT`, `HUGGING_FACE_DATASETS`). Blocked from live user discovery, reserved for backend admin operations or offline data merging.

## Enforcement
The `assertSourceAllowedForStage` function checks the source policy before a source is used at a specific stage. If a source is not authorized for `LIVE_DISCOVERY` (for example Common Crawl, Hugging Face datasets, SpiderFoot, Google Maps scraper output, CSV/XLSX/JSON imports, website metadata, or Snov.io), it is blocked from live user runtime.

That does not mean those sources are bad data sources. It means they belong to different stages:
- Common Crawl: offline mining only.
- Hugging Face datasets: admin import/research only after license review.
- Google Maps scraper output: admin import only, never runtime scraping.
- SpiderFoot: admin research only.
- Website metadata: enrichment only.
- Snov.io: future email enrichment only.
- CSV/XLSX/JSON imports: admin import only.

Live discovery runtime remains limited to approved search metadata providers such as `SERPER` and `SERPAPI`, with Google Places handled separately as an official local-business API stage.
