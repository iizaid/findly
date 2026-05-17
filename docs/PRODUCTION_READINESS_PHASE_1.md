# Findly Production Readiness - Phase 1

Phase 1 adds a safer deployment foundation. It does not make Findly fully production-complete, and it does not add billing, checkout, password reset, monitoring SaaS integrations, or load-test certification.

## What Phase 1 Added

- GitHub Actions CI for frontend build, backend tests, backend lint, and Prisma schema validation.
- Stricter production environment validation on server startup.
- Public liveness and readiness health endpoints.
- Focused tests for health responses and production env safety.
- Practical documentation for deployment checks and remaining gaps.

## Required Production Environment Variables

Set production values in the hosting provider, not in committed files.

- `NODE_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET` with at least 32 characters and not the example placeholder
- `CLIENT_ORIGIN` with explicit production frontend origin(s), never `*` or localhost
- `CLIENT_URL` with the production frontend URL
- `APP_URL` with the production API URL
- `COOKIE_SECURE=true`
- `CSRF_COOKIE_SECURE=true`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

If dashboard-managed AI provider secrets are enabled:

- `AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED=true`
- `AI_SECRETS_MASTER_KEY` as a base64 value that decodes to at least 32 bytes

Generate a local master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.env`, API keys, SMTP passwords, session secrets, database URLs, or real customer/lead data.

## Local Validation

Run from the repository root:

```bash
npm run build
```

Then run from `server/`:

```bash
npm test
npm run lint
npx prisma validate
```

`npx prisma migrate status` is useful locally or in staging when pointed at the intended database, but CI should not require production database access.

## CI

The workflow is in `.github/workflows/ci.yml`.

It runs on:

- Pull requests
- Pushes to `main`

It uses Node.js 20 and a temporary PostgreSQL service for backend tests. It does not require real AI provider keys, SMTP credentials, or production secrets.

Blocking checks:

- Frontend build: `npm run build`
- Backend lint: `cd server && npm run lint`
- Backend tests: `cd server && npm test`
- Prisma validation: `cd server && npx prisma validate`

## Health Endpoints

`GET /api/health`

Lightweight liveness check. Returns service name, timestamp, uptime, and environment. It does not check the database and does not include secrets.

`GET /api/health/ready`

Readiness check. Performs a cheap database query and returns safe database status. On database failure it returns HTTP 503 with a safe message and no raw database error.

`GET /api/ready`

Legacy readiness route kept for compatibility.

## Still Not Production-Complete

- Payments and billing checkout are intentionally not implemented in this phase.
- Password reset may still need production review if not already implemented.
- Production monitoring and alerting are not integrated yet.
- Load testing and capacity validation are still needed.
- Legal pages and compliance copy are still needed.
- Real Render/Vercel/Neon deployment smoke tests are still needed.
- CI validates Prisma schema but does not run against production databases.

Phase 1 target: production foundation complete, not full production readiness.
