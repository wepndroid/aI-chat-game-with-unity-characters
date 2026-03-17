# AI Chat Game Frontend

Next.js App Router frontend for marketing pages, account UI, memberships, characters, and admin views.

## Quick Start
1. `npm install`
2. `copy .env.example .env`
3. `npm run dev`

Frontend runs on `http://127.0.0.1:5000` by default.

## Environment Variables
- `NEXT_PUBLIC_API_BASE_URL` (default local backend: `http://127.0.0.1:4000/api`)
- `NEXT_PUBLIC_PATREON_URL`
- `NEXT_PUBLIC_PATREON_TIER_MODELS_URL`
- `NEXT_PUBLIC_PATREON_TIER_SECRETWAIFU_URL`
- optional media/link values in `.env.example`

Only public values belong in frontend env files. Never place backend secrets in `NEXT_PUBLIC_*`.

## Auth + Access Behavior
- Session state comes from backend `GET /api/auth/me`
- Cookie-based auth is used (`credentials: include`)
- No localStorage auth/session storage
- Header admin nav appears only for backend role `ADMIN`

## Route Protection
- Auth-required pages are guarded via route guard layouts:
  - profile/account pages
  - upload/creator management pages
  - members page
- Admin pages require backend role `ADMIN`
- Unauthorized users see explicit access messages

## Members + Patreon Flow
- Uses authenticated backend endpoints only:
  - `GET /api/patreon/status`
  - `GET /api/patreon/connect`
  - `POST /api/patreon/sync`
  - `POST /api/patreon/disconnect`
- UI states include:
  - not connected
  - connected but inactive
  - active entitlement
  - sync in progress

## Gated Character Content
- Character list and detail are loaded from backend character APIs
- Gated lock/unlock state is derived from backend membership + entitlement snapshot
- If access is missing, UI shows connect/upgrade CTA
- Restricted `vroidFileUrl` is not rendered for unauthorized users
