# AI Chat Game Backend

This service provides backend/API fundamentals and database schema foundations for:
- Users
- Characters
- Reviews
- Patreon-linked accounts
- Entitlement records

## Tech
- Node.js + Express + TypeScript
- Prisma ORM
- SQLite (development default)

## Quick Start
1. Install dependencies:
   `npm install`
2. Create env file:
   `copy .env.example .env`
3. Generate Prisma client:
   `npm run prisma:generate`
4. Apply schema to local DB:
   `npm run prisma:push`
5. Seed sample data:
   `npm run seed`
6. Run API:
   `npm run dev`

## Core Endpoints
- `GET /api/health`
- `GET /api/users`
- `POST /api/users`
- `GET /api/characters`
- `POST /api/characters`
- `PATCH /api/characters/:characterId/status`
- `GET /api/stats/overview`

## Notes
- Authentication and secure session handling are intentionally deferred to later milestones.
- This milestone establishes stable API and schema foundations for upcoming auth, moderation, and Patreon flows.
