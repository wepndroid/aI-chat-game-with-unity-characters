# Authentication and Access Control Implementation Plan

## Scope
Prepare the existing project for a production-grade Authentication and Access Control milestone without rewriting the app.

- Frontend: `Frontend` (Next.js)
- Backend: `Backend` (Express + TypeScript + Prisma)
- Keep current UI style, only update form/state behavior where required
- Reuse existing Patreon schema and route logic where possible

## Current Audit (Based on Existing Files)

### 1. Registration and Login
- Current state: UI-driven local auth in browser storage (`Frontend/src/lib/auth-session.ts`), sign-in modal in `Frontend/src/components/shared/header.tsx`, sign-up page in `Frontend/src/app/sign-up/page.tsx`
- Issue: not server-authenticated, plaintext password in localStorage, client-trust role assignment
- Backend currently has no real auth route set (`Backend/src/app.ts` mounts health/users/characters/stats/patreon only)

### 2. Email Verification
- Current state: `User.isEmailVerified` exists in Prisma (`Backend/prisma/schema.prisma`)
- Issue: no verification token model, no send/verify endpoints, no verification gate

### 3. Password Reset
- Current state: forgot-password page is a placeholder (`Frontend/src/app/auth/forgot-password/page.tsx`)
- Issue: no reset token model, no request/reset endpoints

### 4. Optional Social Media Login
- Current state: not implemented
- Issue: no OAuth account model or provider callback route

### 5. Patreon OAuth Integration
- Current state: implemented foundation in backend and membership UI
  - `Backend/src/routes/patreon-routes.ts`
  - `Backend/src/lib/patreon-sync.ts`
  - `Frontend/src/components/membership/membership-page.tsx`
- Issue: identity is email-param based in multiple Patreon endpoints instead of authenticated session user

### 6. Rating Verification
- Current state: Review schema exists (`Review` model), but no verified rating write/read policy route
- Issue: no enforced rule like "verified user only", "one user one rating" at API boundary (unique index exists but no secure endpoint)

### 7. Content Restriction Rules
- Current state: character fields support gating (`isPatreonGated`, `minimumTierCents`) in schema and listing data
- Issue: no centralized server access guard tied to authenticated user entitlements

## Unsafe Flows That Must Be Replaced

1. Local storage auth
- Current files: `Frontend/src/lib/auth-session.ts`, `Frontend/src/components/shared/header.tsx`, `Frontend/src/app/sign-up/page.tsx`
- Replace with secure server-auth + HttpOnly cookie session/JWT + `/auth/me`

2. Raw email-based Patreon identity
- Current files: `Backend/src/routes/patreon-routes.ts`, `Frontend/src/components/membership/membership-page.tsx`
- Replace with authenticated `req.auth.userId` identity (remove public email identity control path)

3. Direct `ownerId` in request body
- Current file: `Backend/src/routes/character-routes.ts`
- Replace by deriving owner from authenticated user context

4. Missing admin authorization
- Current files: `Backend/src/routes/character-routes.ts`, `Backend/src/routes/user-routes.ts`, frontend admin pages under `Frontend/src/app/admin/*`
- Replace with backend admin guard middleware for admin operations

## File-Level Implementation Plan (Full Milestone)

### Database (Prisma)
Must change:
- `Backend/prisma/schema.prisma`

Add/adjust:
- `User`
  - enforce password hash usage for local auth
  - keep `isEmailVerified`
- New model: `EmailVerificationToken`
  - `id`, `userId`, `tokenHash`, `expiresAt`, `consumedAt`, `createdAt`
- New model: `PasswordResetToken`
  - `id`, `userId`, `tokenHash`, `expiresAt`, `consumedAt`, `createdAt`
- New model: `SocialAccount` (optional login providers)
  - `id`, `userId`, `provider`, `providerUserId`, `createdAt`, unique(provider, providerUserId)
- New model: `AuthSession` (optional but recommended for revocation)
  - `id`, `userId`, `sessionTokenHash`, `expiresAt`, `revokedAt`, `createdAt`

### Backend (Express)
Must change:
- `Backend/src/app.ts`
- `Backend/src/routes/user-routes.ts`
- `Backend/src/routes/character-routes.ts`
- `Backend/src/routes/patreon-routes.ts`
- `Backend/src/routes/stats-routes.ts` (if admin-scoped analytics access)
- `Backend/src/server.ts` (if secure cookie config by env)
- `Backend/package.json`

Must add:
- `Backend/src/routes/auth-routes.ts`
- `Backend/src/middleware/auth-middleware.ts`
- `Backend/src/lib/password-hash.ts`
- `Backend/src/lib/auth-token.ts`
- `Backend/src/lib/auth-cookie.ts`
- `Backend/src/lib/rating-policy.ts`
- `Backend/src/types/express.d.ts`

Optional add now, full feature later:
- `Backend/src/routes/social-auth-routes.ts` (provider-ready stubs)
- `Backend/src/routes/review-routes.ts` (verified rating endpoint)

### Frontend (Next.js)
Must change:
- `Frontend/src/lib/auth-session.ts` (replace local-only model)
- `Frontend/src/components/shared/header.tsx` (server login state via `/auth/me`)
- `Frontend/src/app/sign-up/page.tsx` (register API integration + verify status)
- `Frontend/src/app/auth/forgot-password/page.tsx` (real request-reset form)
- `Frontend/src/components/membership/membership-page.tsx` (remove email query identity; use authenticated endpoints)
- pages that depend on role/UI auth state:
  - `Frontend/src/app/admin/dashboard/page.tsx`
  - `Frontend/src/app/admin/users/page.tsx`
  - `Frontend/src/app/admin/community-vrms/page.tsx`
  - `Frontend/src/app/admin/official-vrms/page.tsx`
  - `Frontend/src/app/admin/review-queue/page.tsx`
  - `Frontend/src/app/admin/global-settings/page.tsx`

Must add:
- `Frontend/src/lib/api-client.ts`
- `Frontend/src/lib/auth-api.ts`
- `Frontend/src/lib/session-user.ts`
- `Frontend/src/app/auth/verify-email/page.tsx`
- `Frontend/src/app/auth/reset-password/page.tsx`
- `Frontend/src/components/shared/protected-route.tsx` (or server-route equivalent)

## Execution Phases

### Phase A (This step: prepare codebase)
1. Add backend auth foundation files (password hash, token, cookie, middleware)
2. Add `/api/auth` baseline endpoints (`register`, `login`, `logout`, `me`)
3. Register auth route in Express app
4. Add Prisma schema preparation models for verification/reset/social/session
5. Add frontend auth API client foundation (no full UI rewrite yet)

### Phase B
1. Replace localStorage auth flows in header/sign-up/sign-out
2. Add email verification request + verify flow
3. Add password reset request + confirm flow
4. Add optional social login provider wiring

### Phase C
1. Lock Patreon routes to authenticated user context (deprecate email identity params)
2. Replace `ownerId` body usage with `req.auth.userId`
3. Enforce admin guards on admin/mutation endpoints
4. Add review/rating endpoint with verification rules
5. Enforce content restriction checks from entitlements on gated endpoints

## Preparation Work Implemented In This Step
- Create foundational backend auth utilities/middleware/routes
- Wire auth routes into app bootstrap
- Add Prisma models needed for upcoming verification/reset/social/session flows
- Add frontend auth API client foundations for migration away from localStorage auth

## Non-Goals In This Step
- Full UI migration of all auth forms and pages
- Full social provider implementation
- Full Patreon endpoint migration to authenticated identity only
- Full rating/content-policy enforcement
