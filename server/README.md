# Findly Backend

Secure Express + PostgreSQL + Prisma foundation for Findly.

This backend covers account/session/workspace/credits, email verification, dashboard access, source status, search campaign persistence, lead lists, Google Places adapter readiness, and rule-based lead analysis. It does not include unsafe scraping, AI integrations, payments, exports, or unsupported social-platform automation.

## Setup

1. Copy `.env.example` to `.env`.
2. Set a real `DATABASE_URL`.
3. Set a long random `SESSION_SECRET`. Do not use the example placeholder.
4. Install dependencies:

```bash
npm install
```

5. Generate Prisma Client:

```bash
npx prisma generate
```

6. Run migrations:

```bash
npx prisma migrate dev
```

7. Start the API:

```bash
npm run dev
```

## Useful Commands

```bash
npm run lint
npm test
npx prisma validate
npx prisma generate
npx prisma migrate dev
npm run import:datasets:dry-run
npm run import:datasets
npm run admin:promote -- --email founder@example.com
```

## Health Check

```bash
curl http://localhost:4000/api/health
```

Expected response envelope:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "findly-api"
  },
  "message": "Backend is healthy."
}
```

## Current Endpoints

- `GET /api/health`
- `GET /api/ready`
- `GET /api/sources/status`
- `GET /api/csrf-token`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/sessions`
- `DELETE /api/sessions/:id`
- `GET /api/credits`
- `GET /api/credits/history`

## Local Dataset Import

Findly can import private local Excel/CSV datasets into a shared internal lead catalog before paid provider APIs are connected. This is an admin/founder ingestion flow, not a normal-user workflow.

1. Place files in the project root `Data/` folder. The importer also supports the current local folder name `local data/`.
2. Keep these folders private. They are ignored by git and should not be committed.
3. Supported files: `.xlsx` and `.csv`. Convert old `.xls` files to `.xlsx` first.
4. Optionally set a custom folder in `.env`:

```bash
DATASET_IMPORT_DIR="../Data"
DATASET_IMPORT_MODE="global"
```

`IMPORT_USER_EMAIL` is no longer required for normal imports. The CLI writes to the shared internal catalog so verified users can search the stored data through the dashboard.

Dry-run without writing to the database:

```bash
npm run import:datasets:dry-run
```

Real import:

```bash
npm run import:datasets
```

Each file creates a `DatasetImport` record and shared `LeadCatalog` rows. Rows are mapped flexibly, normalized, deduplicated globally, and stored with `sourceFile`, `importedAt`, `rawData`, `detectedSignals`, and dataset provenance. User searches create user-owned `LeadList` snapshots that reference matching catalog records; users do not browse or import the raw catalog directly. Importing and searching the internal dataset costs 0 credits during local development; analyzing saved leads keeps the normal analysis credit rules.
- `GET /api/credits/estimate-search`
- `GET /api/workspaces`
- `GET /api/workspaces/:id`
- `GET /api/dashboard`
- `GET /api/search/intelligence`
- `GET /api/search/sources/status`
- `GET /api/search/profiles`
- `POST /api/search/profiles`
- `GET /api/search/campaigns`
- `POST /api/search/campaigns`
- `GET /api/search/campaigns/:id`
- `GET /api/search/campaigns/:id/status`
- `POST /api/search/campaigns/:id/run`
- `POST /api/search/campaigns/:id/analyze`
- `GET /api/search/campaigns/:id/leads`
- `GET /api/search/campaigns/:id/analytics`
- `GET /api/search/lists`
- `GET /api/search/opportunity-signals`
- `GET /api/search/leads`
- `GET /api/search/leads/map`
- `GET /api/search/leads/:id`
- `POST /api/search/leads/:id/analyze`
- `POST /api/search/leads/:id/enrich-website`
- `PATCH /api/search/leads/:id/status`
- `DELETE /api/search/leads/:id`
- `GET /api/search/credits`
- `GET /api/search/credits/estimate`
- `GET /api/jobs/:id`
- `GET /api/admin/summary`
- `GET /api/admin/users`
- `GET /api/admin/catalog/stats`
- `GET /api/admin/imports`
- `GET /api/admin/campaigns`
- `GET /api/admin/security/events`
- `GET /api/admin/errors`

## Admin Operations

Findly includes an admin-only operations foundation for founder/operator monitoring. Admin routes require:

- authenticated session
- verified email
- `User.role = ADMIN`

Normal users receive `403 FORBIDDEN` from `/api/admin/*` and do not see the admin navigation item in the dashboard.

To promote an existing verified user:

```bash
npm run admin:promote -- --email founder@example.com
```

The script does not create accounts and does not accept passwords. It only updates an existing verified user to `ADMIN` and records an audit log event.

Admin APIs expose safe operational summaries only: user counts, catalog stats, dataset import summaries, campaign summaries, recent audit/security events, and safe backend error logs. They do not return password hashes, session tokens, verification tokens, API keys, SMTP credentials, or local dataset file paths.

## Authentication

Findly uses opaque HTTP-only cookie sessions:

- The browser receives only an opaque session token.
- The database stores only an HMAC hash of that token.
- Session expiration and `revokedAt` are enforced server-side.
- Logout revokes the current session and clears the cookie.
- Session listing and revocation are scoped to the authenticated user.
- The API never returns `passwordHash`.

## Email Verification

Registration creates an authenticated but unverified account:

- `emailVerified` starts as `false`.
- `creditsBalance` starts at `0`.
- A secure email verification token is generated.
- Only an HMAC hash of the token is stored in `EmailVerificationToken`.
- The raw token is sent only inside the verification email link.
- Tokens expire and can be used once.
- Resending verification email invalidates prior unused tokens.
- Initial free credits are granted only after successful email verification.

Verification flow:

1. User registers through `POST /api/auth/register`.
2. Backend sends a verification email.
3. Frontend opens `/verify-email?token=...`.
4. Frontend calls `POST /api/auth/verify-email`.
5. Backend marks the email verified and grants 50 Opportunity Credits exactly once.
6. The verification endpoint does not create a login session from the email link. The user must log in normally before entering the dashboard.
7. Verified users with a valid session can access `GET /api/dashboard`.

Gmail development SMTP requires an app password, not the normal Gmail account password. Configure these variables in `.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
EMAIL_FROM="Findly <your-email@gmail.com>"
APP_URL=http://localhost:4000
CLIENT_URL=http://localhost:5173
```

In development and test without SMTP credentials, the mail service uses a local JSON transport. Production requires SMTP configuration at startup.

Cookie settings:

- `httpOnly: true`
- `sameSite: lax`
- `secure: true` in production
- `path: /`

## CSRF

Because authentication uses cookies, protected state-changing routes require CSRF protection.

Flow:

1. Call `GET /api/csrf-token`.
2. Read `data.csrfToken`.
3. Send that value in the `X-CSRF-Token` header on protected `POST`, `PATCH`, `PUT`, or `DELETE` requests.

Registration and login are exempt to keep the first-auth flow simple, but they are protected by strict validation, CORS, and auth-specific rate limits.

`POST /api/auth/verify-email` is also CSRF-exempt because it is called from an emailed one-time token link. The token itself is high entropy, hashed at rest, expiring, and single-use. Authenticated protected mutations such as logout and resend verification still require CSRF.

## Security Protections

Application-level protections implemented:

- Helmet security headers
- Strict configured CORS
- HTTP-only cookie sessions
- CSRF protection for protected mutations
- General API rate limiting
- Signup-specific rate limiting
- Login-specific rate limiting
- Verification attempt rate limiting
- Verification resend cooldown
- Honeypot field support on registration
- Failed login audit logging
- Generic invalid credential errors
- Progressive in-memory delay on repeated failed login attempts
- Maximum active session pruning per user
- Request body size limits
- JSON-only body enforcement for requests with bodies
- Malformed JSON handling
- Payload-too-large handling
- Zod validation on bodies, params, and queries
- Centralized error envelopes
- Safe production error messages
- Prisma ORM with parameterized queries
- Database ownership checks for sessions and workspaces
- Verified-email gate for dashboard access
- Verified-email gate for search and analysis tools
- Idempotent initial credit grant after email verification
- Atomic credit deduction with a database-side balance check
- Structured JSON request/error logging with request IDs
- Safe readiness and source status endpoints that do not expose API keys
- Expensive search and analysis endpoint rate limits
- Search campaign run locking to prevent duplicate simultaneous runs
- Database job state fields for campaign runs
- Database `Job` records for campaign execution with pollable status
- `OpportunitySignal` storage for future Reddit/forum-style demand signals separate from direct business leads
- Safe website enrichment with timeout, protocol, and response-size limits
- Provider adapters stay disabled or not configured until official keys/integrations are added
- Reddit is present as an official API adapter foundation for public opportunity signals only; it does not scrape Reddit HTML and is not enabled for execution without approved API access
- Provider HTTP calls map auth, rate-limit, timeout, bad-response, and unavailable failures to safe error codes
- A lightweight provider cache interface exists for short-lived normalized provider responses

## Reddit Source Foundation

Reddit is adapter-ready, not production-enabled. It is designed for compliant demand-signal discovery through official Reddit API access only.

Use cases:

- service requests
- business pain points
- local recommendations
- discussions that reveal demand for websites, booking systems, digital menus, automation, or digital presence work

Findly treats Reddit output as `OpportunitySignal`, not verified business listings. The system stores minimized public post metadata and hashed author references. It must not be used for spam, posting automation, profile harvesting, private data collection, or HTML scraping.

Optional Reddit environment variables:

```bash
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
REDDIT_REFRESH_TOKEN=
REDDIT_ACCESS_TOKEN_URL=https://www.reddit.com/api/v1/access_token
REDDIT_API_BASE_URL=https://oauth.reddit.com
REDDIT_REQUEST_TIMEOUT_MS=10000
REDDIT_MAX_RESULTS_DEFAULT=25
REDDIT_MAX_RESULTS_HARD_LIMIT=50
```

## DDoS Reality Check

This app includes application-level abuse protection. That is not the same as full DDoS protection.

Production DDoS protection should be handled by infrastructure:

- Cloudflare or similar edge protection
- Hosting provider DDoS protection
- Reverse proxy request limits
- CDN caching where applicable
- Infrastructure-level monitoring and alerts

Do not rely on Express rate limits alone for volumetric attacks.

## Testing

Integration tests use the configured `DATABASE_URL`. Use a development or test database, not production.

```bash
npm test
```

The tests cover:

- Registration success
- Duplicate email blocking
- Invalid registration rejection
- Login success
- Wrong password generic error
- Logout with CSRF protection
- `me` authenticated/unauthenticated behavior
- Password hash not returned
- Initial credits
- Email verification token creation and verification
- Initial credits granted only after verification
- Duplicate verification does not double-grant credits
- Dashboard blocked for unverified users
- Default workspace creation
- Invalid session params
- Malformed JSON handling
- Readiness/source status safety
- Unconfigured source runs fail cleanly
- Lead analysis does not double-charge when reused
- Unsafe website enrichment URLs are rejected

## Production Notes

Before production:

- Use a strong `SESSION_SECRET`.
- Set `NODE_ENV=production`.
- Set `secure` HTTPS deployment so secure cookies work.
- Configure `CLIENT_ORIGIN` to exact production origins only.
- Run migrations against the production database.
- Put the API behind trusted edge/reverse proxy protection.
- Configure SMTP for real verification email delivery.
- Add password reset flow.
- Send structured logs to a production log platform.
- Add background workers/queues before running long search jobs at scale.

### Auth Production Setup

For proper cross-site deployment (e.g. Vercel frontend, Render backend), configure the following in production:

```bash
COOKIE_SAME_SITE="none"
COOKIE_SECURE="true"
CSRF_COOKIE_SAME_SITE="none"
CSRF_COOKIE_SECURE="true"
CLIENT_ORIGIN="https://your-frontend-domain.com"
```

For same-domain or subdomain deployment (e.g., frontend on `app.findly.com`, backend on `api.findly.com`), use stricter settings:

```bash
COOKIE_SAME_SITE="lax"
COOKIE_SECURE="true"
COOKIE_DOMAIN=".findly.com"
CSRF_COOKIE_SAME_SITE="lax"
CSRF_COOKIE_SECURE="true"
CSRF_COOKIE_DOMAIN=".findly.com"
CLIENT_ORIGIN="https://app.findly.com"
```

*Note: Redis or Upstash is recommended for rate-limiting in production multi-instance deployments. Password reset remains pending and is not currently implemented. SMTP must use app passwords or provider-specific secure credentials. Never commit `.env`.*
