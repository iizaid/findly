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
QUEUE_DRIVER=postgres
MAX_SEARCH_WORKER_CONCURRENCY=2
SEARCH_QUEUE_CONCURRENCY=2
WORKER_POLL_INTERVAL_MS=1000
MAX_ACTIVE_SEARCH_JOBS_PER_USER=2
MAX_QUEUED_SEARCH_JOBS=100
MAX_RUNNING_SEARCH_JOBS=10
JOB_STALE_TIMEOUT_MINUTES=60
LOCAL_DATASET_CANDIDATE_LIMIT=1000
```

The API rejects new campaign runs when a user already has too many active search jobs or the system queue is full.

## Reliability Controls

The PostgreSQL worker now records job heartbeats while a campaign is running. Stale cleanup uses the heartbeat first and `lockedAt` as a fallback, which prevents a live long-running worker from being mistaken for a dead one.

Queued campaigns are also cleaned up. If a campaign is `QUEUED` but its latest search job has failed, was cancelled, or stayed queued beyond `JOB_STALE_TIMEOUT_MINUTES`, the campaign is moved to a terminal state and any active credit reservation is released.

Users can cancel queued or running searches:

```text
POST /api/search/campaigns/:id/cancel
```

Queued jobs are cancelled immediately. Running jobs receive a cancellation request and stop at the next safe checkpoint.

## Credit Reservations

Searches reserve the maximum possible Opportunity Credits before the job is queued:

```text
SEARCH_BASE_CREDITS + requestedLimit * SEARCH_PER_RETURNED_LEAD_CREDITS
```

This prevents concurrent queued searches from overspending the same balance. When the job completes, Findly captures only the actual cost and releases unused reserved credits. Failed or cancelled jobs release the full reservation. Zero-result searches capture `0` credits.

## Campaign Run Flow

```text
POST /api/search/campaigns/:id/run
-> validates auth, verified email, ownership, status, credits, and queue pressure
-> reserves maximum estimated credits
-> marks campaign QUEUED
-> creates SEARCH_CAMPAIGN_RUN job
-> returns 202 with campaignId and jobId

Worker
-> claims one queued job atomically
-> heartbeats while processing
-> marks campaign RUNNING
-> runs source adapter
-> saves LeadList snapshot
-> captures actual credits and releases unused reservation in the same transaction as campaign completion
-> marks job and campaign COMPLETED or FAILED
```

Clients should poll:

```text
GET /api/search/campaigns/:id/status
```

The status response includes latest job state, progress fields, result count, and `leadListId` after completion.

Admin queue metrics are available at:

```text
GET /api/admin/system/queue
```

The response includes queued/running counts, 24-hour completed/failed counts, average and p95 job duration, oldest queued job age, stuck job count, queue driver, and configured concurrency limits. This endpoint is admin-only and does not expose job payloads or secrets.

## Queue Driver Roadmap

Current active driver:

```bash
QUEUE_DRIVER=postgres
```

The code now has a queue adapter boundary so Redis/BullMQ can be added later without changing campaign controllers. `QUEUE_DRIVER=redis`, `REDIS_URL`, `SEARCH_QUEUE_RATE_LIMIT_MAX`, and `SEARCH_QUEUE_RATE_LIMIT_DURATION_MS` are reserved configuration values, but Redis processing is not enabled yet. Keep PostgreSQL as the active driver until Redis infrastructure and BullMQ tests are added.

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

Read path while workers are busy:

```bash
npm run load:read-path
```

These scripts are intentionally lightweight and use Node's built-in `fetch`.

## Current Limits

- Queue is PostgreSQL-backed. It is safe for current scale, but BullMQ/Redis should be considered when job volume grows.
- The search worker uses bounded concurrency, but provider-specific rate limits still need adapter-level tuning when paid APIs are enabled.
- Local catalog search now uses a bounded candidate pool and narrower first-pass queries, but full-text indexing may be needed for much larger catalogs.
- Credit reservations are database-backed and protect user balances, but high-volume production should use database connection pooling because API and worker processes both need reliable transaction capacity.
