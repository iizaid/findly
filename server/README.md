# Findly Backend

Secure Express + PostgreSQL + Prisma foundation for Findly.

This backend currently covers account/session/workspace/credits foundation only. It does not include scraping, lead analysis, AI, payments, or external API integrations.

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
- `GET /api/csrf-token`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/sessions`
- `DELETE /api/sessions/:id`
- `GET /api/credits`
- `GET /api/credits/history`
- `GET /api/workspaces`
- `GET /api/workspaces/:id`

## Authentication

Findly uses opaque HTTP-only cookie sessions:

- The browser receives only an opaque session token.
- The database stores only an HMAC hash of that token.
- Session expiration and `revokedAt` are enforced server-side.
- Logout revokes the current session and clears the cookie.
- Session listing and revocation are scoped to the authenticated user.
- The API never returns `passwordHash`.

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

## Security Protections

Application-level protections implemented:

- Helmet security headers
- Strict configured CORS
- HTTP-only cookie sessions
- CSRF protection for protected mutations
- General API rate limiting
- Signup-specific rate limiting
- Login-specific rate limiting
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
- Default workspace creation
- Invalid session params
- Malformed JSON handling

## Production Notes

Before production:

- Use a strong `SESSION_SECRET`.
- Set `NODE_ENV=production`.
- Set `secure` HTTPS deployment so secure cookies work.
- Configure `CLIENT_ORIGIN` to exact production origins only.
- Run migrations against the production database.
- Put the API behind trusted edge/reverse proxy protection.
- Add email verification and password reset flows.
- Add structured logging and monitoring.
