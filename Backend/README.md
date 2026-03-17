# AI Chat Game Backend

Express + Prisma API for authentication, Patreon linking, characters, reviews, and admin operations.

## Stack
- Node.js + Express + TypeScript
- Prisma ORM
- SQLite for local development (schema is Postgres-ready)

## Quick Start
1. `npm install`
2. `copy .env.example .env`
3. Fill real credentials in `.env` (never commit `.env`)
4. `npm run prisma:sync`
5. `npm run seed`
6. `npm run dev`

## Security Baseline
- Passwords: Argon2 hashing (`passwordHash`)
- Sessions: opaque random tokens, hashed in DB
- Session transport: HTTP-only cookie, secure in production
- Token flows: hashed one-time tokens for verification/reset
- Patreon/OAuth identities are linked to authenticated user accounts
- `GET /api/users` is admin-only
- CORS allowlist uses explicit origins only

## Required Environment Variables

Use placeholders only in `.env.example`. Put real values only in local `.env` / secret manager.

### Core
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `FRONTEND_URL`
- `BACKEND_PUBLIC_URL`
- `CORS_ORIGIN` (comma-separated explicit origins)

### Auth + Cookies
- `AUTH_COOKIE_NAME`
- `AUTH_SESSION_TTL_MS`
- `AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MS`
- `AUTH_PASSWORD_RESET_TOKEN_TTL_MS`
- `AUTH_VERIFY_EMAIL_URL_BASE`
- `AUTH_RESET_PASSWORD_URL_BASE`

### OAuth State
- `AUTH_OAUTH_STATE_COOKIE_NAME`
- `AUTH_OAUTH_STATE_TTL_MS`
- `AUTH_OAUTH_DEFAULT_REDIRECT_AFTER`

### Email
- `EMAIL_FROM`
- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASS`

### Google OAuth (Optional)
- `GOOGLE_OAUTH_ENABLED`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_SCOPES`

### Patreon OAuth
- `PATREON_OAUTH_ENABLED`
- `PATREON_CLIENT_ID`
- `PATREON_CLIENT_SECRET`
- `PATREON_REDIRECT_URI`
- `PATREON_SCOPES`
- `PATREON_CAMPAIGN_ID` (optional but recommended in production)
- `PATREON_TOKEN_ENCRYPTION_KEY` (must resolve to 32 bytes)

Generate a secure Patreon token key example:
- PowerShell: `[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Minimum 0 -Maximum 256}))`

## Auth Flow
1. `POST /api/auth/register`
2. Backend creates unverified user, hashes password, issues session cookie
3. Verification email is sent (or logged in dev if SMTP not configured)
4. `POST /api/auth/login` issues a new session cookie on valid credentials
5. `GET /api/auth/me` resolves current user from cookie-backed session
6. `POST /api/auth/logout` revokes session and clears cookie

## Email Verification
- `POST /api/auth/resend-verification`
- `GET /api/auth/verify-email?token=...`
- `POST /api/auth/verify-email-code`

Rules:
- Verification tokens are hashed and time-limited
- Used/expired tokens are rejected
- Verification marks `user.isEmailVerified = true`
- Public resend endpoint returns generic response to reduce account enumeration
- Registration/resend sends one-time verification code to inbox

## Password Reset
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Rules:
- Reset tokens are hashed and time-limited
- On successful reset:
  - password hash is replaced
  - reset tokens are consumed
  - all active sessions are revoked

## Social Login
- `GET /api/auth/oauth/:provider/start`
- `GET /api/auth/oauth/:provider/callback`

Implemented provider:
- Google

Rules:
- OAuth state is cookie-backed and validated
- Provider identities are linked through `OAuthAccount`
- Verified provider email is required for auto-link/create
- Existing accounts are linked without duplication
- Successful OAuth login creates the same session cookie as email/password login

## Patreon Linking
- `GET /api/patreon/connect`
- `GET /api/patreon/oauth/callback`
- `GET /api/patreon/status`
- `POST /api/patreon/sync`
- `POST /api/patreon/disconnect`

Rules:
- Connect/status/sync/disconnect require authenticated session user
- No raw email identity in Patreon API calls
- Patreon account + entitlement records are tied to `userId`
- Sensitive Patreon tokens are encrypted at rest

## Access Control Rules

### Characters
- Public visitors: only approved + public characters
- Owners: can access own private/unlisted records
- Admins: can access all records
- Patreon-gated access is enforced server-side using active entitlements/tier
- Character create uses authenticated user as owner

### Reviews / Ratings
- Must be authenticated
- Must be email-verified
- One review per user per character
- No reviewing own character
- Rating range validated server-side
- Patreon-gated characters require entitlement before review
- Average rating is recalculated on create/update/delete

## Admin Protection
- Admin middleware (`requireAdmin`) guards admin endpoints
- Frontend visibility is not trusted for role checks
- Role is resolved from backend session user only

## Core Endpoints
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/resend-verification`
- `GET /api/auth/verify-email`
- `POST /api/auth/verify-email-code`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/oauth/:provider/start`
- `GET /api/auth/oauth/:provider/callback`
- `GET /api/users` (admin)
- `GET /api/characters`
- `GET /api/characters/:characterId`
- `POST /api/characters`
- `PATCH /api/characters/:characterId/status` (admin)
- `GET /api/characters/:characterId/reviews`
- `POST /api/characters/:characterId/reviews`
- `PATCH /api/reviews/:reviewId`
- `DELETE /api/reviews/:reviewId`
- `GET /api/stats/overview`
- `GET /api/patreon/connect`
- `GET /api/patreon/oauth/callback`
- `GET /api/patreon/status`
- `POST /api/patreon/sync`
- `POST /api/patreon/disconnect`

## Secret Hygiene Checklist
- Keep `.env` out of git
- Keep only placeholders in `.env.example`
- Rotate any leaked OAuth/client/token secret immediately
- Use environment-specific secret storage in production
