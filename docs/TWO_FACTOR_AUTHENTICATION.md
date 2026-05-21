# Two-Factor Authentication

Findly supports authenticator-app two-factor authentication (TOTP) for verified users without replacing the existing session or OAuth architecture.

## Scope

- TOTP uses a server-generated secret plus a local authenticator app such as Google Authenticator, Microsoft Authenticator, Authy, or 1Password.
- No external 2FA service is required at login time.
- Existing email/password login still works for users who have not enabled 2FA.
- Existing OAuth flows remain supported. If a linked user has 2FA enabled, OAuth login now pauses before the final session and requires a second factor.

## Flow

### Setup start

`POST /api/auth/2fa/setup/start`

- authenticated user only
- verified email required
- CSRF required
- generates a new TOTP secret
- stores the secret as encrypted pending setup state
- returns:
  - `otpauthUrl`
  - `qrCodeDataUrl`
  - `manualSetupKey`

The manual key is returned only for the active setup step so the user can scan or enter it into an authenticator app.

### Setup confirm

`POST /api/auth/2fa/setup/confirm`

- authenticated user only
- CSRF required
- requires a valid 6-digit code
- promotes the pending encrypted secret to active
- generates 10 backup codes
- returns backup codes once
- sends a security email

Backup codes must be saved immediately. They are not retrievable later in plaintext.

### Login challenge

When a user with 2FA enabled signs in successfully with the primary factor:

- Findly does **not** create the final authenticated session yet.
- Findly creates a short-lived DB-backed `TwoFactorChallenge`.
- The client receives:
  - `requiresTwoFactor: true`
  - `challengeToken`
  - `expiresAt`

The final session is created only after `POST /api/auth/2fa/login/verify` succeeds.

### Login verify

`POST /api/auth/2fa/login/verify`

- tied to a short-lived pending challenge
- accepts either:
  - authenticator TOTP code
  - backup code
- on success:
  - consumes the challenge
  - creates the normal session
- backup codes are one-time use
- challenge attempts are capped and the challenge is invalidated on abuse

### Disable 2FA

`POST /api/auth/2fa/disable`

- authenticated user only
- CSRF required
- requires:
  - current password for password-based accounts
  - valid TOTP or valid backup code
- on success:
  - disables 2FA
  - removes active secret and backup codes
  - sends a security email

### Backup code regeneration

`POST /api/auth/2fa/backup-codes/regenerate`

- authenticated user only
- CSRF required
- requires a valid TOTP code
- replaces all previous backup codes
- returns the new backup codes once
- sends a security email

## Storage model

- TOTP secrets are encrypted at rest using AES-256-GCM.
- The encryption key comes from `TWO_FACTOR_SECRET_ENCRYPTION_KEY`.
- Backup codes are stored as hashes only.
- Pending login challenges store only a token hash, never the raw token.

## Environment

Required for production when `TWO_FACTOR_AUTH_ENABLED=true`:

- `TWO_FACTOR_SECRET_ENCRYPTION_KEY`
  - base64
  - decodes to at least 32 bytes

Important variables:

- `TWO_FACTOR_AUTH_ENABLED`
- `TWO_FACTOR_ISSUER`
- `TWO_FACTOR_LOGIN_CHALLENGE_TTL_MINUTES`
- `TWO_FACTOR_LOGIN_MAX_ATTEMPTS`
- `TWO_FACTOR_SETUP_CONFIRM_WINDOW_MS`
- `TWO_FACTOR_SETUP_CONFIRM_MAX`
- `TWO_FACTOR_LOGIN_VERIFY_WINDOW_MS`
- `TWO_FACTOR_LOGIN_VERIFY_MAX`
- `TWO_FACTOR_DISABLE_WINDOW_MS`
- `TWO_FACTOR_DISABLE_MAX`
- `TWO_FACTOR_BACKUP_REGENERATE_WINDOW_MS`
- `TWO_FACTOR_BACKUP_REGENERATE_MAX`

## Security notes

- The TOTP secret is never stored in plaintext.
- Backup codes are never stored in plaintext.
- The final session is never created before second-factor verification.
- Normal users are not forced into 2FA unless they enable it.
- 2FA endpoints keep existing CSRF and auth guard patterns.

## Current limitations

- No SMS 2FA in this phase.
- No passkeys in this phase.
- No admin or root “disable another user’s 2FA” recovery flow in this phase.
- Account recovery policy beyond backup codes is still a later security design task.
