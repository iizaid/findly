# Findly Production Code Hardening Execution Plan

This document tracks the code-only work needed to move Findly closer to a production-ready codebase.

The goal is not to deploy production from this file. The goal is to prepare the repository so the owner can later complete the manual production work: domains, Render/Vercel/Neon setup, real SMTP, OAuth production apps, secrets, monitoring accounts, and backups.

## Current Rule

Work in small, safe commits on `main` only when explicitly requested by the owner.

Do not make broad rewrites.
Do not add scraping or crawling.
Do not add payments yet.
Do not weaken auth, sessions, CSRF, admin guards, rate limits, credits, or source policies.
Do not expose Common Crawl as a user-facing source.
Do not store raw HTML or raw archive payloads.
Do not commit secrets.

## Phase 0 — Safety Baseline

Status: started.

Purpose:
Create a clear execution plan before touching production-sensitive code.

Acceptance:
- This document exists.
- Future work is split into small commits.
- Each code phase has a narrow purpose.

## Phase 1 — Safe Production Observability

Purpose:
Add safe internal timing and runtime metadata so we can understand production behavior without exposing secrets or raw data.

Target areas:
- search runtime duration
- local dataset duration
- evidence cache duration
- open web evidence duration
- paid provider duration
- website job item duration
- cache hit and skipped reason counters

Rules:
- No schema change unless absolutely necessary.
- Prefer existing metadata objects and logs.
- No raw HTML.
- No provider secrets.
- No raw provider payloads.
- Add tests for any new metadata fields that affect API results.

Expected commit:
`feat: add safe production observability metadata`

## Phase 2 — Open Web Evidence Production Guardrails

Purpose:
Strengthen tests and guardrails around the newest Open Web Evidence layer.

Tasks:
- Add full campaign-flow test when Open Web Evidence is disabled.
- Add website job timeout test for Common Crawl failure.
- Confirm no Common Crawl / CC-MAIN / WARC terms appear in normal user responses.
- Keep WARC bounded and documented.

Expected commit:
`test: harden open web evidence production guardrails`

## Phase 3 — Search, Credits, and Campaign Reliability

Purpose:
Protect the most sensitive product logic before public production.

Tasks:
- Verify no double charging.
- Verify failed campaigns release reservations.
- Verify no ghost lead-list rows.
- Improve metadata around why paid providers were skipped or used.
- Add campaign stuck/recovery notes or safe admin recovery if low risk.

Expected commit:
`test: strengthen search credit and campaign reliability`

## Phase 4 — Website Jobs Operational Safety

Purpose:
Make admin website jobs easier to operate safely in private beta and production-like environments.

Tasks:
- Add safe job item metrics.
- Improve safe failed/skipped reasons.
- Document stale lock recovery.
- Add tests for timeout and locked-job behavior where missing.

Expected commit:
`feat: improve website job operational safety`

## Phase 5 — Production Deployment Docs and Env Readiness

Purpose:
Make manual deployment work straightforward and safe.

Tasks:
- Add production deployment runbook.
- Add production env checklist.
- Document Render/Vercel/Neon sequence.
- Document SMTP and OAuth production checks.
- Document upload persistence limitations.
- Document migration flow using `prisma migrate deploy`.

Expected commit:
`docs: add production deployment runbook and env checklist`

## Phase 6 — Frontend Production UX Safety

Purpose:
Prevent confusing or broken production UX without redesigning the whole app.

Tasks:
- Improve 401/403/429/503 panel-level states.
- Improve empty states.
- Confirm normal users do not see admin-only UI.
- Confirm Common Crawl/Open Web internals are not user-facing.
- Keep dashboard from fully crashing on one panel failure.

Expected commit:
`fix: improve dashboard production error states`

## Phase 7 — Opportunity Recommendation Engine

Purpose:
Turn collected signals into clear business recommendations.

Tasks:
- Add deterministic recommendation service.
- Map signals to services like website build, digital menu, booking flow, SEO cleanup, contact flow.
- Add evidence-backed reasons.
- Add confidence and priority.
- Add tests.
- Show first in admin or lead detail without overbuilding outreach.

Expected commit:
`feat: add evidence-backed opportunity recommendations`

## Phase 8 — AI Analysis Hardening

Purpose:
Make AI-assisted analysis safer and cheaper.

Tasks:
- Ensure deterministic fallback works when AI provider is unavailable.
- Avoid raw prompt/provider response logging.
- Add safe duration/provider metadata.
- Add failure tests.

Expected commit:
`fix: harden ai analysis fallback and safe metadata`

## Phase 9 — Controlled Apify Export Import Presets

Purpose:
Use Apify only as a controlled admin/offline import source, not as live user scraping.

Tasks:
- Add source policy for Apify exports.
- Add optional import preset for Apify Instagram export JSON/CSV.
- Extract safe social signals.
- Minimize personal data storage.
- Add tests with sample export.

Expected commit:
`feat: add controlled Apify export import preset`

## Phase 10 — CI, Smoke, and Release Discipline

Purpose:
Make future changes safer.

Tasks:
- Add or document smoke checks.
- Keep CI current.
- Document commit message expectations.
- Add release checklist.

Expected commit:
`ci: add production smoke validation checklist`

## Simple Working Method

For each phase:

1. Inspect the relevant files.
2. Make the smallest useful change.
3. Add or update tests.
4. Run validation.
5. Commit with a clear message.
6. Review CI before starting the next phase.

## Current Production Code Status

Current status:
Strong private-beta codebase.

Target status:
Production-ready codebase, waiting only for manual deployment and real production service setup.
