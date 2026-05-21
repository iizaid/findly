# Findly Auth Abuse Protection

Findly hardens signup, login, OAuth account creation, password reset, and email verification resend with layered controls:

- route-level `express-rate-limit` for coarse request throttling
- Postgres-backed auth abuse counters for multi-instance-safe auth decisions
- per-IP, per-email-hash, per-domain, and pairwise counters
- generic login and password-reset responses to reduce enumeration
- verification resend cooldown plus DB-backed resend caps
- optional Turnstile bot challenge support
- signup honeypot plus minimum form timing signal

## What Is Protected

### Signup

- per-IP hourly limit
- per-IP daily limit
- per-email-hash limit
- per-email-domain limit
- optional disposable-email blocklist
- no user, workspace, session, or credits are created until abuse checks pass

### Login

- per-email-hash failed-attempt limit
- per-IP failed-attempt limit
- per IP+email failed-attempt limit
- password spraying detection via distinct-email tracking per IP
- distributed attack detection via distinct-IP tracking per email hash
- successful login clears the direct email and ip+email failure state

### Password Reset

- generic response regardless of account existence
- per-email-hash, per-IP, and IP+email suppression
- repeated abusive requests are suppressed instead of sending more mail

### Email Verification Resend

- existing cooldown remains active
- per-user and per-IP resend counters prevent mail bombing

### OAuth

- start and callback routes have route-level throttles plus DB-backed per-IP counters
- new OAuth user creation goes through signup-style abuse checks
- linking OAuth to an existing verified user is not treated as new-account spam

## Bot Challenge

Turnstile is optional and disabled by default.

- `BOT_CHALLENGE_ENABLED=false` keeps local development friction-free
- `BOT_CHALLENGE_SIGNUP_MODE=required` forces a challenge on signup
- `BOT_CHALLENGE_SIGNUP_MODE=risk_based` only requires a challenge for suspicious signup signals
- `BOT_CHALLENGE_PASSWORD_RESET_MODE` works the same way for forgot-password

The backend verifies challenge tokens server-side and never exposes the secret key.

Frontend note:

- keep `TURNSTILE_SECRET_KEY` only in `server/.env`
- expose only the public site key to Vite as `VITE_TURNSTILE_SITE_KEY`
- if `VITE_TURNSTILE_SITE_KEY` is unset, the auth UI stays unchanged and no widget is rendered

## Multi-Instance Note

Memory-only rate limits are not enough for production auth protection across multiple app instances. Findly now makes the critical auth abuse decisions from Postgres-backed counters so signup, login, password reset, resend verification, and OAuth signup controls survive multi-instance deployments more safely.

## Recommended Values

### Development

- keep abuse protection enabled
- keep bot challenge disabled
- use high route-level limits if local testing needs it

### Private Beta

- leave auth abuse protection enabled
- keep disposable-domain blocking optional until invite quality is understood
- enable Turnstile only if signup spam appears

### Production

- keep auth abuse protection enabled
- configure explicit disposable-domain blocklist if needed
- strongly consider enabling Turnstile for `risk_based` signup mode
- monitor blocked abuse events and reset-email suppression volume
