# Findly Scaling Notes

Findly now queues search campaign runs and processes them outside the HTTP request lifecycle.

## Process Modes

API-only mode:

```bash
ENABLE_WORKER=false npm start
```

API and worker in one process:

```bash
ENABLE_WORKER=true npm start
```

Separate worker process:

```bash
npm run worker
```

For Render-style deployment, prefer:

- Web Service: `npm start` with `ENABLE_WORKER=false`
- Background Worker: `npm run worker`
- Same PostgreSQL database and environment variables for both services
- Backend and database in the same region where possible

## Queue Controls

Recommended starting values:

```bash
MAX_SEARCH_WORKER_CONCURRENCY=2
WORKER_POLL_INTERVAL_MS=1000
MAX_ACTIVE_SEARCH_JOBS_PER_USER=2
MAX_QUEUED_SEARCH_JOBS=100
MAX_RUNNING_SEARCH_JOBS=10
JOB_STALE_TIMEOUT_MINUTES=60
LOCAL_DATASET_CANDIDATE_LIMIT=1000
```

The API rejects new campaign runs when a user already has too many active search jobs or the system queue is full.

## Campaign Run Flow

```text
POST /api/search/campaigns/:id/run
-> validates auth, verified email, ownership, status, credits, and queue pressure
-> marks campaign QUEUED
-> creates SEARCH_CAMPAIGN_RUN job
-> returns 202 with campaignId and jobId

Worker
-> claims one queued job atomically
-> marks campaign RUNNING
-> runs source adapter
-> saves LeadList snapshot
-> deducts credits in the same transaction as campaign completion
-> marks job and campaign COMPLETED or FAILED
```

Clients should poll:

```text
GET /api/search/campaigns/:id/status
```

The status response includes latest job state, progress fields, result count, and `leadListId` after completion.

## Load Testing

Environment variables:

```bash
BASE_URL=http://localhost:4000
TEST_EMAIL=verified-user@example.com
TEST_PASSWORD=...
WORKSPACE_ID=...
```

Smoke:

```bash
npm run load:smoke
```

Search queue:

```bash
npm run load:search
```

These scripts are intentionally lightweight and use Node's built-in `fetch`.

## Current Limits

- Queue is PostgreSQL-backed. It is safe for current scale, but BullMQ/Redis should be considered when job volume grows.
- The search worker uses bounded concurrency, but provider-specific rate limits still need adapter-level tuning when paid APIs are enabled.
- Local catalog search now uses a bounded candidate pool and narrower first-pass queries, but full-text indexing may be needed for much larger catalogs.
