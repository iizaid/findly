# Transactional Email Production Notes

Findly currently uses a transactional email abstraction backed by SMTP. The code is structured so security and auth emails are sent through one service layer without hardcoding provider secrets into controllers.

## Current provider behavior

- `EMAIL_PROVIDER=smtp` is the currently implemented provider mode.
- In test mode, mail uses `jsonTransport` and the test outbox.
- In non-production development without SMTP config, mail safely falls back to local JSON transport.
- In production, transactional email configuration is required.

## Supported email categories

- email verification
- password reset
- password changed
- two-factor enabled
- two-factor disabled
- backup codes regenerated
- backup code used

Security emails are best-effort notifications. Core auth flows should not fail just because a security email provider is unavailable.

## Recommended production sender setup

Use a real transactional sender domain. Recommended addresses:

- `noreply@yourdomain.com`
- `security@yourdomain.com`
- `support@yourdomain.com`

Avoid using a personal mailbox as the long-term production sender.

## Required production email DNS

Before production rollout, configure:

- SPF
- DKIM
- DMARC

Also verify the sending domain inside your SMTP or transactional email provider.

## Environment

Current implemented variables:

- `EMAIL_PROVIDER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `EMAIL_SECURITY_FROM`

## Recommended providers

The current code path is SMTP-first. Good production choices include any provider that gives stable transactional SMTP access, such as:

- Postmark
- Mailgun
- Amazon SES
- SendGrid
- Resend SMTP

Direct provider API integrations can be added later if there is a clear deliverability or operational reason, but they are not required for the current TOTP rollout.

## Operational notes

- Keep password reset and verification links pointed at the correct `CLIENT_URL` / `APP_URL` pair.
- Do not log raw verification tokens, reset tokens, SMTP passwords, OAuth secrets, or session identifiers.
- Rotate SMTP credentials through the normal secret-management path.
- Monitor bounce and complaint rates once real production sending starts.

## Current limitations

- No provider-specific API client integration in this phase.
- No dedicated email queue in this phase.
- No advanced template localization in this phase.
