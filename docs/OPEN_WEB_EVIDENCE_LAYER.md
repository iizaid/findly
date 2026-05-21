# Open Web Evidence Layer

Findly includes an internal Open Web Evidence Layer that uses Common Crawl as a backend-only evidence source.

## Product behavior

- Normal users do not see Common Crawl in any source selector.
- The layer runs silently behind local dataset reuse and before paid discovery when enabled.
- The layer can also assist website enrichment jobs before live website metadata fetches.
- User-facing copy should refer only to neutral concepts such as `public web evidence`, `archived web evidence`, or `open web signals`.

## Evidence cascade

For search assistance, Findly now uses this order:

1. Local dataset
2. Existing reusable discovery evidence
3. Open Web Evidence Layer
4. Paid search metadata / Google Places only if still needed
5. AI reasoning after evidence collection

For website enrichment jobs:

1. Existing recent website metadata evidence
2. Open Web Evidence Layer
3. Live website metadata fetch if archived evidence is insufficient

## Common Crawl access model

This implementation uses public HTTP access only. No Common Crawl API key is required for v1.

- Index resolution uses `https://index.commoncrawl.org/collinfo.json`
- URL lookups use `https://index.commoncrawl.org/<index>-index?...`
- Archived record fetches use bounded byte ranges against `https://data.commoncrawl.org/...`

The implementation follows Common Crawl guidance:

- HTTPS only
- explicit User-Agent
- low request volume
- no multi-threaded burst access
- fail-open behavior when Common Crawl is slow or unavailable
- bounded WARC byte-range fetches only when explicitly enabled

## Safety model

- no raw HTML is stored in the database
- no raw WARC payloads are stored
- no user-facing Common Crawl terminology is exposed
- unsafe/private/localhost URLs are skipped
- bounded byte-range archive reads only
- strict request timeouts
- fail-open: existing search/enrichment flow continues if Common Crawl fails

## Storage model

- `OpenWebEvidenceCache` stores normalized signals and small metadata only
- `LeadEvidence` is still used when archived evidence is promoted into reusable campaign evidence
- high-confidence archived evidence can be promoted to `LeadCatalog` through the existing promotion flow

## Cost behavior

- Open web lookups do not deduct user credits directly
- the layer is intended to reduce paid discovery usage
- existing credit reservation/capture logic remains the source of truth

## Key env variables

```env
OPEN_WEB_EVIDENCE_ENABLED=true
OPEN_WEB_EVIDENCE_PROVIDER=common_crawl
OPEN_WEB_EVIDENCE_FAIL_OPEN=true
OPEN_WEB_EVIDENCE_CACHE_TTL_DAYS=30
OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN=5
OPEN_WEB_EVIDENCE_TIMEOUT_MS=6000
OPEN_WEB_EVIDENCE_USER_AGENT=FindlyOpenWebEvidence/0.1
OPEN_WEB_EVIDENCE_MIN_CONFIDENCE_TO_SKIP_PAID=70
OPEN_WEB_EVIDENCE_MAX_URLS_PER_SEARCH=10
OPEN_WEB_EVIDENCE_ENABLE_SEARCH_ASSIST=true
OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS=true
OPEN_WEB_EVIDENCE_ENABLE_DOMAIN_ENRICHMENT=true

COMMON_CRAWL_ENABLED=true
COMMON_CRAWL_INDEX_ID=latest
COMMON_CRAWL_INDEX_BASE_URL=https://index.commoncrawl.org
COMMON_CRAWL_DATA_BASE_URL=https://data.commoncrawl.org
COMMON_CRAWL_MAX_INDEX_RESULTS=10
COMMON_CRAWL_FETCH_WAT_ENABLED=false
COMMON_CRAWL_FETCH_WARC_ENABLED=true
COMMON_CRAWL_MAX_WARC_BYTES=262144
COMMON_CRAWL_TIMEOUT_MS=6000
```

Operational note:

- `COMMON_CRAWL_FETCH_WARC_ENABLED=true` is acceptable only because v1 keeps strict byte caps, HTML-only filtering, and short timeouts.
- If you see slow archive responses or unexpected network cost in private beta, disable WARC fetches first and keep the rest of the layer enabled.
- Do not increase `COMMON_CRAWL_MAX_WARC_BYTES` casually.

## Local testing

1. Keep the layer enabled.
2. Mock Common Crawl index and archive HTTP responses in tests.
3. Run:

```bash
cd server
npm run lint
npm test
npx prisma validate
npx prisma migrate status
```

Then from repo root:

```bash
npm run build
npm run lint
```

## Limitations

- This is not a general business directory.
- Common Crawl freshness is uneven and can be stale.
- The layer does not bulk-download WARC archives.
- WAT-specific extraction is reserved for later work.
- Promotion still depends on confidence thresholds and existing dedupe rules.
- The layer improves coverage and cost efficiency; it does not replace the rest of the discovery pipeline.
