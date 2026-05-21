# Findly OAuth Authentication

Findly supports Google, GitHub, and Discord as backend-controlled OAuth identity providers. OAuth is an identity layer on top of the existing Findly user, workspace, session, CSRF, and audit systems.

## Environment

```env
# OAuth
OAUTH_ENABLED=false
OAUTH_STATE_TTL_MINUTES=10
OAUTH_ALLOWED_RETURN_PATHS=/dashboard,/settings,/billing
OAUTH_DEFAULT_SUCCESS_PATH=/dashboard
OAUTH_FAILURE_PATH=/auth

GOOGLE_OAUTH_ENABLED=false
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/oauth/google/callback

GITHUB_OAUTH_ENABLED=false
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/oauth/github/callback

DISCORD_OAUTH_ENABLED=false
DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
DISCORD_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/oauth/discord/callback
```

Production callback examples:

```text
https://api.yourdomain.com/api/auth/oauth/google/callback
https://api.yourdomain.com/api/auth/oauth/github/callback
https://api.yourdomain.com/api/auth/oauth/discord/callback
```

In production, any enabled provider must have a client id, client secret, and non-localhost redirect URI.

## Provider Setup

Google:

- Create an OAuth Client in Google Cloud Console.
- Type: Web application.
- Authorized redirect URI:
  - local: `http://localhost:4000/api/auth/oauth/google/callback`
  - prod: `https://api.yourdomain.com/api/auth/oauth/google/callback`
- Scopes: `openid email profile`

GitHub:

- Create a GitHub OAuth App.
- Homepage URL: frontend URL.
- Authorization callback URL:
  - local: `http://localhost:4000/api/auth/oauth/github/callback`
  - prod: `https://api.yourdomain.com/api/auth/oauth/github/callback`
- Scopes: `read:user user:email`

Discord:

- Create a Discord application.
- Add OAuth2 redirect URI:
  - local: `http://localhost:4000/api/auth/oauth/discord/callback`
  - prod: `https://api.yourdomain.com/api/auth/oauth/discord/callback`
- Scopes: `identify email`

## Security Behavior

- Authorization Code Flow only.
- OAuth secrets stay backend-only.
- Raw state is never stored; only an HMAC state hash is stored in `OAuthState`.
- State expires after `OAUTH_STATE_TTL_MINUTES` and is atomically marked used to prevent replay.
- Provider access tokens are used in memory only for userinfo calls and are not persisted.
- Auto-linking and account creation require a verified provider email.
- OAuth-created users get normal `USER` role.
- OAuth login uses the existing Findly session cookie and session table.
- OAuth does not weaken CSRF. Start/callback are GET routes protected by OAuth state.
- Return redirects are restricted to `OAUTH_ALLOWED_RETURN_PATHS`.

## User and Workspace Behavior

- If `(provider, providerAccountId)` already exists, Findly logs in the linked user.
- If no OAuth account exists and the provider email is verified:
  - existing Findly user with that email: provider identity is linked to that user.
  - no matching user: Findly creates a user, default workspace, workspace owner membership, and initial credits.
- Repeated OAuth login does not create duplicate users, duplicate OAuth accounts, or duplicate workspaces.
- OAuth-only users have `passwordHash = null`. Password reset can set a password through the existing verified-email reset flow.

## Failure Redirects

The backend redirects to `OAUTH_FAILURE_PATH` with one of these safe codes:

- `oauth_provider_unavailable`
- `oauth_invalid_state`
- `oauth_email_unverified`
- `oauth_email_missing`
- `oauth_login_failed`

The frontend maps these to predefined user-safe messages and never displays raw query text.
