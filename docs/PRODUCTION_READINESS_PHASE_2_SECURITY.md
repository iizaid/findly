# Findly Production Readiness - Phase 2 Security

Phase 2 adds account recovery and focused security hardening. This does not make Findly fully production-ready, and it does not add payments, legal pages, external monitoring, or deployment automation.

## Phase 2 Status

Target statement: Phase 2 security and account recovery hardening complete.

## What Phase 2 Added

- Secure forgot-password and reset-password backend endpoints.
- Single-use password reset tokens stored as HMAC hashes only.
- Reset email builder using the existing server-side mail abstraction.
- Full session revocation after password reset.
- Dedicated password reset rate limit configuration.
- Safer static upload headers.
- Stronger admin import upload validation.
- Central frontend URL safety helpers for external links and uploaded assets.
- Minimal frontend forgot/reset password flow.

## Password Reset Flow

`POST /api/auth/forgot-password` accepts an email and always returns:

`If an account exists, a reset email has been sent.`

If the user exists and is verified, Findly invalidates previous active reset tokens, creates a new token, stores only the token hash, and sends a reset link to `CLIENT_URL/reset-password?token=...`.

`POST /api/auth/reset-password` accepts the raw email-link token and a new password. It hashes the token, finds the stored record, rejects invalid/expired/used tokens, updates the password, marks the token used, and revokes all sessions for that user.

## Token Security Guarantees

- Raw token exists only in memory long enough to build the email link.
- Database stores `tokenHash`, never the raw token.
- Token hash uses HMAC SHA-256 with a distinct `password-reset:` namespace.
- Default TTL is 45 minutes.
- Tokens are single-use via `usedAt`.
- Previous active tokens for a user are invalidated before a new token is issued.
- API responses and audit logs do not include raw tokens.

## Enumeration Resistance

Forgot-password returns the same generic success response for existing, missing, and unverified accounts. It does not reveal whether an email exists.

## Session Invalidation

Password reset revokes every active session for the user. It does not auto-login the user. Authenticated password update can still keep the current session according to existing behavior.

## Auth Abuse Protection

Backend rate limits cover:

- Register
- Login
- Verify email
- Resend verification
- Forgot password
- Reset password

Failed-login tracking by IP plus email hash remains active. Resend verification cooldown remains backend enforced.

Later hardening if abuse appears:

- Add CAPTCHA or Turnstile on auth recovery routes.
- Use a shared rate-limit store for multi-instance deployments.

## Upload Security

Avatar uploads:

- JPG, PNG, and WebP only.
- 2MB max size.
- Magic-byte detection.
- Random server-side filenames.
- `sharp` processing when available.
- `wx` file writes to avoid overwrites.
- Path containment checks before deletion.
- SVG/HTML/JS disguised as images are rejected by image magic-byte validation.

Admin import uploads:

- CSV and XLSX only.
- Extension and MIME checks.
- XLSX must look ZIP-based (`PK` magic bytes).
- CSV rejects binary/null-byte and HTML/script-like content.
- Temp import files are stored outside public `/uploads`.
- Cleanup only deletes regular `.csv`/`.xlsx` files inside the temp upload directory.

## Asset URL Security

Frontend helpers:

- `safeExternalUrl` allows only `http:` and `https:`.
- `safeAssetUrl` allows only relative `/uploads/` asset paths.
- `javascript:`, `data:`, `vbscript:`, `file:`, malformed URLs, and arbitrary external asset URLs are rejected.

Lead/social links use external URL validation. Avatar/profile assets use uploaded-asset validation.

## Security Headers And Safe Errors

Helmet remains enabled. Phase 2 explicitly configures:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- Frameguard deny

Static `/uploads` responses include `nosniff` and public immutable cache headers. Production error responses do not include stack traces.

## Required Env Vars

New optional server env vars:

- `PASSWORD_RESET_TTL_MINUTES=45`
- `PASSWORD_RESET_RATE_LIMIT_MAX=5`
- `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS=900000`

Use hosting environment variables for production. Do not commit `.env`.

## Manual Testing Checklist

- Request reset for an existing verified account and confirm the email arrives.
- Request reset for a missing account and confirm the UI shows the same generic response.
- Use reset link once and confirm login works with the new password.
- Reuse the same reset link and confirm it fails.
- Confirm old logged-in browser sessions are revoked.
- Upload valid JPG/PNG/WebP avatar.
- Try SVG/HTML disguised as image and confirm rejection.
- Try admin CSV/XLSX import with valid files.
- Try HTML renamed to `.csv` and confirm rejection.

## Still Not Production-Complete

- Payments are not implemented.
- Monitoring and alerting are not integrated.
- Load testing is still needed.
- Legal pages are still needed.
- CAPTCHA/Turnstile may be needed later.
- A shared rate-limit store may be needed for multi-instance deployments.

Do not claim full production readiness from Phase 2 alone.
