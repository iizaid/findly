# Production Geo Intelligence

## Overview

Findly geocodes leads on the backend only. The browser never calls Geoapify or LocationIQ directly, and no geocoding key is exposed through `VITE_` variables.

Core layers:

1. `Lead` and `LeadCatalog` store resolved coordinates plus geo confidence/status metadata.
2. `GeoLocationCache` prevents repeated provider calls for the same normalized query.
3. `GEO_ENRICHMENT_RUN` reuses the existing job table and worker loop.
4. `GET /api/lead-map` is read-only and never geocodes on page load.

By default, `GEO_ENRICHMENT_ENABLED=false` until a backend geocoding provider is configured. This keeps development and unrelated production validation paths from requiring Geoapify or LocationIQ credentials before the feature is intentionally enabled.

## No Fake Marker Policy

- A lead is rendered on the map only when:
  - `geoStatus = RESOLVED`
  - `latitude` and `longitude` are valid
  - `geoConfidence >= GEO_MIN_CONFIDENCE_TO_MAP`
  - `geoAccuracy` is business-level (`business`, `poi`, `amenity`, `address`, or `street`)
- City-only or country-only matches are never rendered as business markers.

## Confidence Rules

- Save threshold: `GEO_MIN_CONFIDENCE_TO_SAVE`
- Map threshold: `GEO_MIN_CONFIDENCE_TO_MAP`
- `LOW_CONFIDENCE`, `AMBIGUOUS`, `FAILED`, and `INVALID_COORDINATES` remain off-map and appear in the not-mappable list instead.

## Provider Flow

1. Normalize the business query from name + address + city + country.
2. Reject vague inputs such as city-only, country-only, or category-only.
3. Check `GeoLocationCache`.
4. Query primary provider.
5. Query fallback provider only if the primary result is missing, fails, or stays below the usable threshold.

## Cost Controls

- Cache-first by normalized query hash
- Configurable TTL: `GEO_CACHE_TTL_DAYS`
- Batch cap: `GEO_MAX_BATCH_SIZE`
- Concurrency cap: `GEO_ENRICHMENT_CONCURRENCY`
- Delay between provider calls: `GEO_ENRICHMENT_ITEM_DELAY_MS`

## PostGIS Requirement

Migration `add_production_geo_intelligence` requires:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

If local Postgres does not include the PostGIS package, the migration should fail. Do not bypass it. Fix the database runtime instead.

### Preflight check

Run:

```bash
cd server
npm run check:postgis
```

The script reports one of three states:

- PostGIS available and installed
- PostGIS available but not installed in the current database
- PostGIS not available in the current PostgreSQL runtime

If the script reports that PostGIS is not available, the geo migration cannot be applied yet.

### Local Docker example

Use a PostGIS-capable image, for example:

```yaml
image: postgis/postgis:16-3.4
```

### Hosted Postgres

- Neon: use a plan/runtime that supports PostGIS extensions.
- Render / managed Postgres: verify extension support before running migrations.

### Windows Prisma DLL lock

If `npx prisma generate` fails on Windows with a `query_engine-windows.dll.node` rename or `EPERM` error:

1. Stop local API, worker, and test processes.
2. Close terminals still running `node`, `npm`, or `vitest`.
3. Run:

```powershell
taskkill /F /IM node.exe
```

4. If the lock remains, delete these directories and reinstall dependencies:

```powershell
Remove-Item -Recurse -Force .\node_modules\.prisma\client
Remove-Item -Recurse -Force .\node_modules\@prisma\client
npm install
```

5. Run:

```powershell
cd server
npx prisma generate
```

6. If the lock still remains, restart VS Code or restart Windows.

This is an environment/process lock issue, not a schema bug.

## Next commands after PostGIS is fixed

```bash
cd server
npm run check:postgis
npx prisma migrate dev --name add_production_geo_intelligence
npx prisma generate
npm test
```

## Manual QA

1. Open Lead Map with no selection and confirm the empty CTA.
2. Open a lead list and send selected leads to the map.
3. Confirm that only reliable coordinates appear as markers.
4. Confirm that unmappable leads stay in the side panel with safe reasons.
5. Run location enrichment and confirm the map refreshes after job completion.
