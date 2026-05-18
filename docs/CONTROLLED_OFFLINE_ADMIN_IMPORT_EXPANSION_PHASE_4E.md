# Controlled Offline/Admin Import Expansion - Phase 4E

## What Phase 4E Adds

Phase 4E expands Findly's admin/offline ingestion path. It adds structured JSON imports, import metadata, source policy enforcement, compliance fields, and optional evidence creation for imported catalog rows.

This phase does not add runtime scraping, browser automation, direct social APIs, payments, or new live providers.

## Supported Import Formats

- CSV
- XLSX
- JSON

## Supported JSON Shapes

Findly accepts these JSON shapes:

```json
[{ "businessName": "Cafe Example", "city": "Amman" }]
```

```json
{ "leads": [{ "businessName": "Cafe Example" }] }
```

```json
{ "businesses": [{ "name": "Cafe Example" }] }
```

```json
{ "results": [] }
```

```json
{ "items": [] }
```

Rows must be objects. Unsupported top-level shapes, invalid JSON, empty files, excessive rows, excessive columns, and dangerous keys such as `__proto__`, `constructor`, and `prototype` are rejected or ignored safely.

## Import Metadata

Admin commit requests can include `importMetadata`:

- `sourceName`
- `sourceUrl`
- `sourcePolicyKey`
- `acquisitionMethod`
- `commercialUseAllowed`
- `attributionRequired`
- `licenseName`
- `licenseUrl`
- `importedFromTool`
- `riskLevel`
- `requiresManualReview`
- `dataFreshness`
- `importPreset`
- `evidenceCreationMode`
- `promoteToCatalogMode`

Metadata is stored in `DatasetImport.mapping.importMetadata` and `DatasetImport.summary.importMetadata`. Policy results are stored alongside it as `policyDecision`.

## Source Policy Enforcement

Imports must use a recognized `sourcePolicyKey` and the source must be allowed for `ADMIN_IMPORT`.

Allowed controlled import sources include:

- `LOCAL_DATASET`
- `CSV_IMPORT`
- `XLSX_IMPORT`
- `JSON_IMPORT`
- `MANUAL_ADMIN_IMPORT`
- `GOOGLE_MAPS_SCRAPER_OUTPUT`
- `COMMON_CRAWL`
- `HUGGING_FACE_DATASETS`

`SPIDERFOOT` remains admin research only and is not accepted as a normal admin dataset import.

Sources blocked from live discovery remain blocked from live discovery even when their offline exports can be imported.

## High-Risk Source Handling

High-risk imports require `requiresManualReview=true`.

If commercial use is not allowed, the import must be manually reviewed.

Sources requiring license review, such as Hugging Face datasets, require manual review plus a `licenseName` or `licenseUrl`.

Findly does not silently downgrade risk.

## Evidence Creation Modes

Supported now:

- `CATALOG_ONLY`: creates LeadCatalog rows only.
- `CREATE_EVIDENCE_AND_CATALOG`: creates LeadCatalog rows and linked LeadEvidence rows.
- `NONE`: no evidence is created.

Rejected safely in this phase:

- `EVIDENCE_ONLY`

Evidence created from imports is linked to the imported or duplicate catalog lead when safe. Confidence is based on data quality and source risk, not blindly set to 100.

## Still Blocked

- Runtime scraping
- Google Maps scraping inside Findly
- Social scraping
- Browser automation
- Login automation
- Proxy scraping
- Payments and billing
- Snov.io runtime
- SpiderFoot runtime
- Common Crawl live runtime

## Manual Admin Checklist

Before importing a dataset, verify:

- Source identity
- Source URL
- License name or URL when applicable
- Commercial use permission
- Acquisition method
- Risk level
- Data freshness
- Manual review flag
- Attribution requirement

## Validation Commands

Run from the project root:

```bash
npm run build
cd server
npm test
npm run lint
npx prisma validate
npx prisma migrate status
```

## Import Size Limits

All imports are subject to these configurable limits:

| Limit                   | Default        | Env Variable           |
|-------------------------|----------------|------------------------|
| Max rows per file       | 25,000         | `MAX_IMPORT_ROWS`      |
| Max columns per file    | 120            | `MAX_IMPORT_COLUMNS`   |
| Max sheets per XLSX     | 20             | `MAX_IMPORT_SHEETS`    |
| Max XLSX XML bytes      | 10 MB          | `MAX_XLSX_XML_BYTES`   |
| Max JSON file bytes     | 10 MB          | `MAX_JSON_IMPORT_BYTES`|
| Max upload file size    | 50 MB          | Multer hard limit      |
| Upload file TTL         | 60 min         | `IMPORT_UPLOAD_TTL_MINUTES` |

Import parsing currently runs synchronously on the main Node.js event loop. Very large files (near the 10 MB / 25,000 row limits) may temporarily block the server from serving other requests. For production deployments with heavy import usage, consider moving parsing to a background worker in a future phase.

## Deployment: Upload Storage Warning

The admin import parse/commit flow uses a **two-step process**:
1. `POST /api/admin/imports/parse` uploads the file to a local temporary directory.
2. `POST /api/admin/imports/commit` reads the previously-uploaded file and processes the import.

**The file must persist on disk between these two requests.**

By default, files are stored in `<process.cwd()>/uploads`. This works on VPS, dedicated servers, and Render instances with persistent disks.

**On serverless or ephemeral hosting (Vercel Serverless Functions, AWS Lambda, Heroku free dynos)**, the filesystem is wiped between requests. The uploaded file will be lost before the commit step, causing the import to fail.

### Recommended production configuration

Set the `ADMIN_UPLOAD_DIR` environment variable to point to a persistent mounted volume:

```bash
ADMIN_UPLOAD_DIR=/mnt/data/findly-uploads
```

If `ADMIN_UPLOAD_DIR` is not set, the default `<cwd>/uploads` directory is used.

A future phase should migrate upload storage to an object store (S3, R2, GCS) for full serverless compatibility.

## Not Production Complete

Phase 4E is a controlled ingestion foundation. It still needs production monitoring, load testing, legal pages, real-user validation, and payment implementation in later phases.
