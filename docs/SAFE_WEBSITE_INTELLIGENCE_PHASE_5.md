# Phase 5: Safe Website Intelligence

## What Phase 5 Adds

Phase 5 adds a safe website metadata enrichment foundation for existing leads. It analyzes only a lead's public homepage URL and extracts small, structured metadata that can explain digital-presence opportunity gaps.

It can detect:

- Website reachable or unreachable.
- Redirected, non-HTML, timed out, or truncated responses.
- Title and meta description quality.
- Contact, menu, booking/reservation, WhatsApp, email, and phone links.
- Instagram, Facebook, TikTok/X-style social links.
- Google Maps links.
- JSON-LD structured data.
- Local business schema, opening hours, aggregate rating, and address signals.
- Possible placeholder or sparse sites.
- Strong or weak conversion paths.

## What Phase 5 Does Not Add

Phase 5 does not add crawling, scraping, browser automation, Playwright, Puppeteer, proxy use, social scraping, direct social APIs, Snov.io, SpiderFoot runtime, Google Maps scraper runtime, payments, or outreach generation.

## Why This Is Not Scraping

The service performs a single controlled homepage metadata fetch for an existing lead's website URL. It does not crawl the site, follow arbitrary page graphs, log into platforms, bypass protections, render JavaScript, or collect raw page content for storage.

## Safe Fetch Rules

Website enrichment uses the existing SSRF-aware safe fetch utility:

- Only `http` and `https` URLs are allowed.
- Localhost, loopback, link-local, private, multicast, and reserved IP ranges are blocked.
- URL credentials are rejected.
- Redirects are limited and every redirect is revalidated.
- Requests use a timeout.
- Response bytes are capped.
- Non-HTML responses are treated as metadata-limited and do not get parsed as HTML.
- Raw HTML is not returned or stored.

Default limits:

- `WEBSITE_FETCH_TIMEOUT_MS=5000`
- `WEBSITE_FETCH_MAX_BYTES=512000`
- `WEBSITE_FETCH_MAX_REDIRECTS=3`
- `WEBSITE_ENRICHMENT_TTL_DAYS=30`

## Metadata Extracted

The service extracts:

- `title`
- `meta description`
- canonical URL
- Open Graph title, description, and URL
- language
- robots meta
- categorized link summaries
- JSON-LD schema presence and schema types
- local business schema indicators
- page size and placeholder indicators

Link summaries are capped by category and include only normalized support fields, not the full link graph.

## Opportunity Signals

Signals are deterministic objects with:

- `key`
- `severity`
- `confidence`
- `reason`
- optional support metadata

Current signal keys include:

- `WEBSITE_REACHABLE`
- `WEBSITE_UNREACHABLE`
- `WEBSITE_TIMEOUT`
- `WEBSITE_NON_HTML`
- `WEBSITE_REDIRECTED`
- `HAS_TITLE`
- `WEAK_TITLE`
- `HAS_META_DESCRIPTION`
- `WEAK_META_DESCRIPTION`
- `MISSING_CONTACT_LINK`
- `HAS_CONTACT_LINK`
- `HAS_MENU_LINK`
- `MISSING_MENU_LINK`
- `HAS_BOOKING_LINK`
- `MISSING_BOOKING_LINK`
- `HAS_WHATSAPP_LINK`
- `HAS_EMAIL_LINK`
- `HAS_PHONE_LINK`
- `HAS_SOCIAL_LINKS`
- `HAS_INSTAGRAM_LINK`
- `HAS_FACEBOOK_LINK`
- `HAS_GOOGLE_MAPS_LINK`
- `HAS_SCHEMA_ORG`
- `HAS_LOCAL_BUSINESS_SCHEMA`
- `POSSIBLE_PLACEHOLDER_SITE`
- `STRONG_CONVERSION_PATH`
- `WEAK_CONVERSION_PATH`

## Evidence Storage

Website enrichment records `LeadEvidence` with:

- `targetSource = WEBSITE`
- `discoveryMethod = WEBSITE_METADATA`
- `sourceType = WEBSITE_METADATA`
- `sourceUrl = normalized website URL`
- `extractedFields = metadata and signals`
- `rawMetadata = status, final URL, fetch timing, warnings, and limits`

Raw HTML is never stored. Snippets are hashed by the existing evidence service.

## Cache / TTL Behavior

Before fetching, the service checks for recent `WEBSITE_METADATA` evidence for the same lead/catalog lead and normalized URL. If evidence is within `WEBSITE_ENRICHMENT_TTL_DAYS`, it returns the cached summary unless `forceRefresh` is used.

## Phase 5B Admin Review Workflow

Phase 5B exposes the existing website intelligence service to admins in a controlled review workflow.

Admin API endpoints:

- `GET /api/admin/catalog-leads/:id/website-intelligence`
- `POST /api/admin/catalog-leads/:id/enrich-website`
- `GET /api/admin/leads/:id/website-intelligence`
- `POST /api/admin/leads/:id/enrich-website`

All endpoints require an authenticated, verified admin account. Mutating enrichment requests also require CSRF protection and are rate-limited. Normal users cannot trigger website enrichment from these admin routes.

The admin catalog detail panel now includes a Website Intelligence card. It can:

- Show an empty state when no website intelligence exists.
- Trigger a single-lead safe website analysis.
- Show cached versus freshly generated results.
- Display reachable/unreachable status, final URL, last checked time, title, and grouped opportunity signals.
- Keep raw HTML and raw provider/evidence internals out of the UI.

The UI does not crawl, follow links, render JavaScript, or create new leads. It only displays sanitized metadata and deterministic signals from `WEBSITE_METADATA` evidence.

## Limitations

- Homepage only.
- No sitemap or robots.txt logic yet.
- No JavaScript rendering.
- No deep page extraction.
- Admin-only UI display is available for catalog lead review.

## Phase 5C Background/Admin Jobs

Phase 5C adds a controlled admin-only job workflow for safe homepage metadata enrichment on small batches of existing catalog leads.

Admin API endpoints:

- `POST /api/admin/website-intelligence/jobs`
- `GET /api/admin/website-intelligence/jobs`
- `GET /api/admin/website-intelligence/jobs/:id`
- `POST /api/admin/website-intelligence/jobs/:id/process-next`

The implementation reuses the existing durable `Job` table with `type = WEBSITE_ENRICHMENT_RUN`. Job payloads contain only safe item summaries, counters, sanitized errors, cache flags, and signal counts. No raw HTML, raw metadata object, full evidence object, or provider details are returned.

Operational controls:

- Default max job size is `WEBSITE_ENRICHMENT_JOB_MAX_ITEMS=25`.
- Hard cap is 100 items through environment validation.
- `WEBSITE_ENRICHMENT_JOB_CONCURRENCY=1` is reserved for future worker hardening; Phase 5C processes one item at a time.
- Default inter-item delay is `WEBSITE_ENRICHMENT_JOB_ITEM_DELAY_MS=250`.
- Job creation and processing are admin-only, CSRF-protected for POST requests, and guarded by `WEBSITE_ENRICHMENT_JOB_RATE_LIMIT_WINDOW_MS` / `WEBSITE_ENRICHMENT_JOB_RATE_LIMIT_MAX`.

Processing behavior:

- Jobs target existing catalog leads only.
- Items without a website URL are skipped safely.
- Unsafe website URLs are marked failed safely.
- Recent `WEBSITE_METADATA` evidence is reused when `forceRefresh=false`.
- `forceRefresh=true` still uses the same safe homepage-only fetch rules.
- Per-item failures do not fail the whole job.
- Website jobs create `LeadEvidence` only; they do not create `LeadCatalog` rows, `LeadListLead` rows, or discovery results.
- The admin UI exposes a compact Website Jobs panel with job creation for recent catalog leads, job progress, and safe per-item summaries.

Recovery limitation:

Phase 5C uses durable DB records and explicit `process-next` processing. It does not add Redis, BullMQ, cron, or an unbounded worker loop. If a process stops mid-job, admins can retry processing the same job after restart.

## Open Web Evidence Note

Findly now also supports a separate backend-only Open Web Evidence Layer documented in `docs/OPEN_WEB_EVIDENCE_LAYER.md`.

- It is not user-facing.
- It does not add a Common Crawl source selector.
- It does not store raw HTML.
- It can contribute archived public-web signals before live homepage fetches when enabled.

## Future Work

- Queue hardening if needed for higher scale.
- Richer job selection UI.
- Robots and sitemap-aware improvements.
- Optional deeper page analysis with strict page limits.
- Outreach and recommendation generation after signals are proven useful.

## Validation Commands

Run:

```bash
npm run build
cd server
npm test
npm run lint
npx prisma validate
npx prisma migrate status
```
