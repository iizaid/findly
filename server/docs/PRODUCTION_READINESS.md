# Findly Production Readiness Checklist

This checklist separates what the Express application can enforce from what production infrastructure must provide.

## Application-Level Protections Implemented

- HTTP-only opaque cookie sessions with hashed tokens at rest.
- Email verification before dashboard/tool access.
- Initial credits granted only after verification and only once.
- CSRF protection for protected mutations.
- Helmet, strict CORS, JSON-only request hardening, and body-size limits.
- General, auth, search, and analysis rate limits.
- Zod validation for route bodies, params, and queries.
- Ownership checks for user/workspace resources.
- Server-controlled credit costs and transactional credit deduction.
- Safe error envelopes without stack traces or provider secrets.
- Structured request logging with request IDs.
- Provider adapter status without exposing API keys.
- Provider request timeouts and safe error mapping.
- Database-backed campaign/job state foundation.
- Reddit adapter foundation uses official API strategy only and is disabled until approved credentials are configured.

## Required Before Public Production

- Production PostgreSQL with automated backups and restore testing.
- HTTPS-only deployment and exact `CLIENT_ORIGIN` values.
- Strong production `SESSION_SECRET`.
- Production SMTP account with monitored delivery.
- Cloudflare, WAF, or equivalent edge protection.
- Hosting/reverse-proxy request limits.
- Centralized logs, metrics, and alerts.
- Production migration workflow.
- Secrets manager for API keys and SMTP credentials.
- API key restrictions for providers where supported.
- Rate-limit store upgrade from process memory to shared storage when multiple API instances are deployed.
- Background worker deployment for long-running search/analysis jobs.
- Queue upgrade to Redis/BullMQ or equivalent when volume grows.
- Data retention policy.
- Privacy policy and terms of service.
- Provider-specific compliance review before enabling each source.

## Source-Specific Notes

- Google Places should run only with official `GOOGLE_PLACES_API_KEY`.
- Reddit must use official API access only. No HTML scraping, no private data, no login bypass, no outreach automation, and no profile harvesting.
- Yelp and SerpAPI are adapter-ready placeholders until official credentials are configured.
- Instagram, Facebook, LinkedIn, TikTok, YouTube, X, and TripAdvisor remain disabled until official/compliant access exists.

## Job and Credits Notes

The current campaign execution can run inline after creating a database job. Failed provider/configuration runs should mark the job and campaign failed safely.

Current credit model is charge-after-success for campaign runs. This avoids charging for provider-not-configured failures. For long-running jobs at scale, add credit reservation and refund semantics before moving work fully to background workers.

## DDoS Reality

Express rate limits reduce application-level abuse but do not stop volumetric DDoS attacks. Real DDoS protection requires an edge provider, hosting-level controls, WAF rules, reverse-proxy limits, and monitoring.
