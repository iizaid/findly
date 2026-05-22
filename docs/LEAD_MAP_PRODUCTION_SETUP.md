# Lead Map Production Setup

## Frontend Map

Lead Map uses MapLibre GL JS.

Required frontend-safe variables:

```env
VITE_LEAD_MAP_ENABLED=true
VITE_MAP_STYLE_URL=
VITE_MAP_DEFAULT_CENTER_LNG=35.0
VITE_MAP_DEFAULT_CENTER_LAT=31.0
VITE_MAP_DEFAULT_ZOOM=6
```

`VITE_MAP_STYLE_URL` must point to a provider style that is safe for browser use. This may include a public style token only when the provider documents it as frontend-safe.

## Tile Provider Guidance

Do not rely on public OpenStreetMap tiles as the production plan.

Use a provider with a style URL compatible with MapLibre, for example:

- MapTiler
- Stadia Maps
- other compatible commercial providers

Respect the provider attribution requirements shown in the map.

## Backend Geocoding

Server-only variables:

```env
GEO_ENRICHMENT_ENABLED=false
GEO_PROVIDER_PRIMARY=geoapify
GEO_PROVIDER_FALLBACK=locationiq
GEOAPIFY_API_KEY=
GEOAPIFY_BASE_URL=https://api.geoapify.com/v1/geocode/search
GEOAPIFY_TIMEOUT_MS=8000
LOCATIONIQ_API_KEY=
LOCATIONIQ_BASE_URL=https://us1.locationiq.com/v1/search
LOCATIONIQ_TIMEOUT_MS=8000
GEO_CACHE_TTL_DAYS=180
GEO_MIN_CONFIDENCE_TO_MAP=70
GEO_MIN_CONFIDENCE_TO_SAVE=55
GEO_MAX_BATCH_SIZE=50
GEO_ENRICHMENT_CONCURRENCY=2
GEO_ENRICHMENT_ITEM_DELAY_MS=250
GEO_PROVIDER_MAX_RETRIES=1
GEO_PROVIDER_FAIL_OPEN=true
```

Rules:

- never prefix geocoding keys with `VITE_`
- never call geocoding providers from the browser
- enable `GEO_ENRICHMENT_ENABLED=true` only after at least one backend geocoding provider key is configured
- keep worker enabled in environments where geo enrichment jobs should process automatically

## Worker Requirement

Geo enrichment is processed through the existing worker loop. Production should run the API and the worker with a queue-compatible configuration.

## Troubleshooting

### Map style missing

Lead Map will show a safe setup state instead of rendering a fake map.

### PostGIS migration fails

Your database runtime is missing PostGIS support. Fix the runtime, then rerun:

```bash
cd server
npx prisma migrate dev --name add_production_geo_intelligence
```

### No markers visible

This is expected when selected leads do not have reliable coordinates above the mapping threshold. Use the enrich action and check the not-mappable panel for safe reasons.
