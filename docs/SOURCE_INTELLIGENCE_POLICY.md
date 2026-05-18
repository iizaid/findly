# Phase 4D: Source Intelligence Policy

## Overview
Findly's discovery engine is governed by the **Source Intelligence Policy**. This is a strict configuration matrix that defines the rules, risks, and allowed execution stages for every current and future data source.

## Guiding Principles
1. **No Scraping:** Direct platform scraping and browser automation are explicitly blocked (`runtimeAllowed: false`).
2. **Evidence-First:** Local and offline sources are always prioritized. Live paid discovery is the final fallback.
3. **Explicit Permissions:** Every source must be statically defined in `sourceIntelligencePolicy.service.js`.

## Core Categories
- **Local Memory:** Immediate local DB lookups (`LOCAL_DATASET`). Free.
- **Evidence Cache:** Reusable evidence from recent queries (`LEAD_EVIDENCE_CACHE`). Free.
- **Search Metadata:** Compliant SERP APIs for signal gathering (`SERPER`, `SERPAPI`). Paid/Low.
- **Official APIs:** Direct partner/official APIs (`GOOGLE_PLACES`). Paid/Medium.
- **Enrichment:** Targeted specific data retrieval (`WEBSITE_METADATA`).
- **Admin OSINT & Offline Imports:** High-risk, offline or admin-only tools (`SPIDERFOOT`, `COMMON_CRAWL`, `CSV_IMPORT`, `HUGGING_FACE_DATASETS`). Blocked at runtime, reserved for backend admin operations or offline data merging.

## Enforcement
The `assertSourceAllowedForStage` function checks the source policy before any search runs. If a source isn't authorized for `LIVE_DISCOVERY` (e.g., offline corpus datasets or raw scraper outputs), it is automatically bypassed or blocked. This saves costs, prevents system abuse, and keeps user-facing workflows extremely fast and safe.
