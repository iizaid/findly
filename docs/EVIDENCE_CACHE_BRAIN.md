# Phase 4D: Evidence Cache & Decision Brain

## Overview
The **Evidence Cache & Decision Brain** acts as the central traffic controller for Findly's discovery engine. It sits between user campaigns and external APIs, intercepting requests to evaluate whether we can fulfill the requested leads using previously captured, high-quality data.

## 1. Evidence Cache (`evidenceCache.service.js`)
Instead of discarding raw signal data, Findly captures it as `LeadEvidence` with a specific `confidenceScore` and `storeUntil` expiration.

The cache looks for candidates that:
- Have a `confidenceScore >= 65`
- Match the campaign's `city`, `country`, and/or `category`
- Match the requested `targetSources` (e.g., INSTAGRAM, FACEBOOK)
- Possess a valid `sourceUrl` and `title`
- Have a `storeUntil` that is either `null` (permanent) or in the future.

### Linked vs. Unlinked Evidence
Linked evidence (`catalogLeadId` present) can be reused directly in lead lists because it points to a real `LeadCatalog` record.

Unlinked evidence (`catalogLeadId` missing) is never inserted directly into `LeadListLead`. Phase 4D.2 keeps it as evidence metadata and reports it through:
- `unlinkedEvidenceCandidatesCount`
- `evidenceSkippedUnlinkedCount`
- `UNLINKED_EVIDENCE_NOT_DIRECTLY_REUSABLE`

This prevents ghost lead-list rows where both `leadId` and `catalogLeadId` are null. Promotion of unlinked evidence remains handled only by explicit safe promotion flows for newly recorded external evidence, not by automatic evidence-cache reuse.

## 2. Discovery Decision Engine (`discoveryDecisionEngine.service.js`)
This engine determines *if* and *how much* external API budget to spend based on coverage.

### Smart Query Budgeting
The brain dynamically adjusts the max allowed external queries based on the **coverage ratio** (Local Results + Reusable Evidence vs. Requested Limit):

- **≥ 70% Reusable Coverage & Acceptable Score:** `maxQueriesAllowed = 0` (skips paid API entirely)
- **50% – 70% Coverage:** `maxQueriesAllowed = min(2, maxSerpQueries)`
- **30% – 50% Coverage:** `maxQueriesAllowed = min(3, maxSerpQueries)`
- **< 30% Coverage:** Proceeds with full configured max.

Coverage for skipping paid providers is based on local results plus linked reusable evidence. Unlinked evidence is useful context, but it does not count as direct lead-list coverage unless it has already been safely promoted or linked.

### Decision Transparency
To provide maximum clarity to developers and auditors, the engine surfaces precise `skippedReasons` such as:
- `LOCAL_COVERAGE_SUFFICIENT`
- `EVIDENCE_COVERAGE_SUFFICIENT`
- `LIVE_DISCOVERY_DISABLED`
- `LOCAL_DATASET_ONLY`
- `BUDGET_LIMIT`

This architecture ensures Findly behaves deterministically, respects budget caps, and naturally becomes faster and cheaper as the internal evidence cache grows over time.
