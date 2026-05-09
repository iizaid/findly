# Findly Backend API

This document describes the current backend surface. It intentionally excludes fake integrations, unsafe scraping, payments, and AI features that are not implemented yet.

## Response Envelope

Success:

```json
{
  "success": true,
  "data": {},
  "message": "..."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "..."
  }
}
```

## Auth and Cookies

Findly uses opaque HTTP-only cookie sessions. The browser stores only the session cookie. The database stores only a hash of the session token.

Protected state-changing requests require an `X-CSRF-Token` header from `GET /api/csrf-token`.

Email verification tokens are single-use, expire, and are stored hashed. Verifying an email grants initial credits once, but does not create a login session from the email link.

## Public System Endpoints

- `GET /api/health` returns basic process health.
- `GET /api/ready` checks database readiness and safe integration status.
- `GET /api/sources/status` returns source availability without exposing API keys.
- `GET /api/csrf-token` returns a CSRF token for protected mutations.

## Account Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/sessions`
- `DELETE /api/sessions/:id`

## Workspace and Credits

- `GET /api/workspaces`
- `GET /api/workspaces/:id`
- `GET /api/credits`
- `GET /api/credits/history`
- `GET /api/credits/estimate-search`

Credit rules:

- The server controls all credit costs.
- Credit grants and deductions run inside transactions.
- Initial credits are granted only after email verification.
- Balance cannot go negative.
- `CreditLedger.balanceAfter` records the resulting balance.

`GET /api/credits/estimate-search` returns a display-only estimate. The frontend may show it, but the backend recalculates real costs before every paid action. The response includes `trustedForCharge: false`, source availability, warnings, current balance, and a cost breakdown.

## Dashboard

- `GET /api/dashboard` requires authentication and verified email.
- `GET /api/search/intelligence` returns campaign, lead, analysis, and credit summary data for the current workspace.

## Admin Operations

Admin routes are under `/api/admin/*`. They require an authenticated, verified user with `User.role = ADMIN`. Normal users cannot access them.

- `GET /api/admin/summary`
- `GET /api/admin/users`
- `GET /api/admin/catalog/stats`
- `GET /api/admin/imports`
- `GET /api/admin/campaigns`
- `GET /api/admin/security/events`
- `GET /api/admin/errors`

Admin responses are paginated where lists are returned and intentionally omit sensitive fields:

- no password hashes
- no session tokens
- no verification tokens
- no API keys
- no SMTP credentials
- no raw local file paths
- no production stack traces

To promote an existing verified user to admin, run:

```bash
npm run admin:promote -- --email founder@example.com
```

## Search Campaigns

- `GET /api/search/sources/status`
- `GET /api/search/profiles`
- `POST /api/search/profiles`
- `GET /api/search/campaigns`
- `POST /api/search/campaigns`
- `GET /api/search/campaigns/:id`
- `GET /api/search/campaigns/:id/status`
- `POST /api/search/campaigns/:id/run`
- `GET /api/search/campaigns/:id/leads`
- `GET /api/search/campaigns/:id/analytics`
- `POST /api/search/campaigns/:id/analyze`

Campaign run rules:

- User must be authenticated and verified.
- Campaign ownership is enforced by `userId`.
- Workspace membership is checked when creating campaigns.
- Service profile ownership is checked when attaching profiles.
- Running sources must be configured and available.
- Campaign run requests create a database `Job` record before execution.
- The campaign is locked into `RUNNING` before source execution.
- Duplicate simultaneous runs are rejected.
- Failures mark the campaign `FAILED` with a safe error code/message.
- Failed inline jobs are also marked `FAILED`, so polling never sees a permanently queued job after a safe provider/configuration failure.

## Leads and Lead Lists

- `GET /api/search/lists`
- `GET /api/search/opportunity-signals`
- `GET /api/search/leads`
- `GET /api/search/leads/map`
- `GET /api/search/leads/:id`
- `POST /api/search/leads/:id/analyze`
- `PATCH /api/search/leads/:id/status`
- `DELETE /api/search/leads/:id`

List endpoints are paginated and scoped to the current user. Map results are capped and only return leads with coordinates.

Imported local datasets are stored in the shared internal `LeadCatalog`. Normal users do not import files and cannot browse the raw catalog directly. A user search creates a user-owned `LeadList` snapshot whose rows reference matching catalog records. Snapshot lead responses may include safe lead fields such as `businessName`, `category`, `city`, `source`, `sourceFile`, `instagramUsername`, `whatsappNumber`, and `detectedSignals`; private Excel/CSV files and local file paths are not exposed by normal API responses.

## Analysis

The current analysis engine is deterministic and rule-based. It uses stored lead data and optional campaign service profile context.

Outputs include:

- `fitScore`
- `opportunityScore`
- `scoreLevel`
- `detectedSignals`
- `reasons`
- `suggestedService`
- `outreachAngle`
- `messageDraft`
- `confidence`
- `nextBestAction`

Analysis costs are server-controlled. Reusing an existing lead analysis does not charge again.

## Source Status

Each source reports:

- `key`
- `label`
- `description`
- `status`
- `configured`
- `available`
- `comingSoon`
- `requiresApiKey`
- `reason`
- `estimatedUseCase`

Source readiness:

- `GOOGLE_MAPS`: adapter-ready and runnable only when `GOOGLE_PLACES_API_KEY` is configured.
- `LOCAL_DATASET`: available when the shared internal catalog contains imported records. It searches private Excel/CSV data previously imported through the server CLI and does not require an API key.
- `REDDIT`: adapter-ready as an official API demand-signal source, but execution is disabled until credentials, approved API access, and compliant usage are explicitly configured.
- `YELP`: adapter-ready for future official Yelp Fusion API integration, but not enabled as a campaign run source yet.
- `SERPAPI`: adapter-ready for future compliant search provider integration, but not enabled as a campaign run source yet.
- `WEBSITE`: available for safe homepage enrichment on existing leads, not campaign discovery.
- `CSV`: adapter-ready plan for future imports, not enabled yet.
- Social/video platforms remain coming later until official compliant integrations are added.

No API keys are ever returned by source status endpoints.

## Local Dataset Import

Local dataset import is a server-side admin/founder CLI flow for private datasets. It imports once into Findly's shared internal catalog. Normal users only search the stored catalog from the dashboard. It supports `.xlsx` and `.csv`; convert old `.xls` files to `.xlsx` first.

Commands:

```bash
npm run import:datasets:dry-run
npm run import:datasets
```

Environment:

```bash
DATASET_IMPORT_DIR="../Data"
DATASET_IMPORT_MODE="global"
```

Import rules:

- The importer only reads from the configured fixed dataset folder, `Data/`, or `local data/`.
- The frontend cannot pass arbitrary filesystem paths.
- `IMPORT_USER_EMAIL` is not required for the default global catalog import mode.
- Each file creates a `DatasetImport` and shared `LeadCatalog` rows.
- User searches create user-owned `LeadList` snapshots that reference matching catalog records.
- Rows with no useful identifier are skipped.
- Duplicate rows are skipped by Instagram username/URL, website, phone, Google Maps URL, source id, normalized name+city, address+city, or dataset fingerprint.
- Importing and searching the internal catalog cost 0 credits during local development.
- Analysis of user-owned saved leads continues to use the normal analysis endpoint and credit rules.
- Spreadsheet formulas are treated as cell values only; no spreadsheet logic is executed.

## Provider Environment

Optional provider variables do not fail startup when missing. Missing providers appear as `not_configured` or `coming_later`.

- `GOOGLE_PLACES_API_KEY`
- `YELP_API_KEY`
- `SERPAPI_API_KEY`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`
- `REDDIT_REFRESH_TOKEN`
- `REDDIT_ACCESS_TOKEN_URL`
- `REDDIT_API_BASE_URL`
- `REDDIT_REQUEST_TIMEOUT_MS`
- `REDDIT_MAX_RESULTS_DEFAULT`
- `REDDIT_MAX_RESULTS_HARD_LIMIT`
- `DATASET_IMPORT_DIR`
- `IMPORT_USER_EMAIL`
- `IMPORT_WORKSPACE_ID`
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `WEBSITE_FETCH_TIMEOUT_MS`
- `SOURCE_REQUEST_TIMEOUT_MS`
- `SOURCE_MAX_RESULTS_DEFAULT`
- `SOURCE_MAX_RESULTS_HARD_LIMIT`
- `SEARCH_RUN_RATE_LIMIT_MAX`
- `ANALYSIS_RUN_RATE_LIMIT_MAX`
- `JOB_STALE_TIMEOUT_MINUTES`
- `CACHE_TTL_SECONDS`

## Website Enrichment

- `POST /api/search/leads/:id/enrich-website`

This endpoint fetches only a public homepage already stored on a lead. It uses timeouts, response-size limits, safe protocols only (`http`/`https`), and a clear Findly user-agent.

It extracts:

- page title
- meta description
- HTTPS status
- contact words
- CTA/menu/booking words
- public social links visible on the homepage
- response status and timing

It stores safe metadata in `Lead.enrichmentData`, updates `Lead.websiteStatus`, and merges detected website signals.

## Job Foundation

Search campaigns support:

- `DRAFT`
- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Job fields include:

- `startedAt`
- `completedAt`
- `failedAt`
- `lockedAt`
- `lockedBy`
- `errorCode`
- `errorMessage`
- `progressCurrent`
- `progressTotal`
- `lastStep`

Current campaign execution is synchronous but job-state-ready. A future worker can pick queued campaigns, lock them, run adapters, and mark final state. Redis/BullMQ can replace this when search volume increases.

- `GET /api/jobs/:id` returns the authenticated user's job status.
- `GET /api/search/campaigns/:id/status` returns campaign progress and latest job status.

Supported job types:

- `SEARCH_CAMPAIGN_RUN`
- `CAMPAIGN_ANALYSIS_RUN`
- `WEBSITE_ENRICHMENT_RUN`
- `EXPORT_RUN`

Credits currently use the safer charge-after-success model for campaign runs: no provider/configuration failure should charge credits before real normalized records are saved. A later long-running worker can evolve this into credit reservation and refund.

The job service exposes helpers for enqueueing, claiming, marking running/completed/failed, retrying failed jobs when attempts remain, and cleaning stale running jobs. The current API can process campaign runs inline after enqueueing; the same job records are ready for a future worker process.

## Reddit Opportunity Signals

Reddit is modeled as an `OpportunitySignal` source, not a direct business listing source. It is intended for official API discovery of public discussions, service requests, market pain points, and demand signals such as "need a website", "online menu", or "booking system recommendations".

Compliance rules:

- Use official/approved Reddit API access only.
- Do not scrape Reddit HTML pages.
- Do not collect private data.
- Do not scrape behind login.
- Do not build posting, commenting, or outreach automation.
- Do not spam Reddit users.
- Store minimized public post metadata only.
- Store a hashed author reference when needed, not unnecessary personal profile data.

`OpportunitySignal` stores:

- `source`
- `sourceId`
- `sourceUrl`
- `title`
- `snippet`
- `authorHash`
- `subreddit`
- `postedAt`
- `score`
- `commentCount`
- `matchedKeywords`
- `detectedIntent`
- `confidence`

Signal analysis is deterministic and should recommend professional market-research actions such as monitoring a discussion, researching business context, or using the signal as market insight. It should not recommend spamming Reddit users.

## Provider Reliability and Cache Foundation

Provider calls use backend-only credentials, timeouts, and safe error mapping:

- `PROVIDER_NOT_CONFIGURED`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TIMEOUT`
- `PROVIDER_BAD_RESPONSE`
- `PROVIDER_UNAVAILABLE`

The cache foundation builds stable keys from source, query, location, and filters. It stores only safe normalized provider data in process memory for a short TTL. This is not a distributed cache; production scale can replace it with Redis or another shared cache.

## Export Foundation

Exports are not implemented yet. The planned API shape is:

- export selected leads
- export campaign leads
- CSV output first
- future async export job

Exports must require verified auth, ownership checks, pagination/selection limits, and server-side credit costs if exports become paid.

## Production Notes

Application-level protection includes Helmet, strict CORS, CSRF, rate limits, request body limits, validation, safe error envelopes, structured logs, and source/campaign throttling.

Real DDoS protection still requires infrastructure such as Cloudflare, WAF rules, reverse proxy limits, hosting-provider protection, and monitoring.
