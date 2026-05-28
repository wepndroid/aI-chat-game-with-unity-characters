# LP Chat Attribution Fix Research Notes - 2026-05-14

## Scope

- Branch/worktree: `dev-Davy-lp-chat-attribution-plan`, based on `origin/dev-Davy`.
- Goal: plan a production-quality attribution fix for `/lp-chat` and verify whether adjacent landing-page attribution flows are correct.
- Mode: research and planning only. No runtime implementation changes yet.

## Live Notes

### 2026-05-14 - Setup

- Created dedicated SecretWaifuWEB worktree at `C:\Users\aless\.config\superpowers\worktrees\SecretWaifuWEB\dev-Davy-lp-chat-attribution-plan`.
- Base commit: `origin/dev-Davy` at `829f6e2667023f83f6d8feec2e1c2e50d101395c`.
- Prior review found `/lp-chat` direct signup CTA likely loses explicit landing identity when it navigates to `/?openSignUp=1`.

### 2026-05-14 - External Research

- Next.js `useSearchParams` is a Client Component hook, and static routes using it should keep a `<Suspense>` boundary around the client component. The existing `/lp-chat` page shape is appropriate and should not be flattened into a fully client route.
- MDN `URLSearchParams` guidance supports using the API directly for query mutation rather than dynamic string interpolation. The fix should centralize query construction in a typed helper instead of repeating ad hoc string logic in landing pages.
- MDN Fetch credentials docs confirm the current attribution calls rely on `credentials: 'include'` to send the landing visitor cookie and receive `Set-Cookie`; backend cookie attribution remains the authoritative conversion link.
- OWASP logging guidance says sensitive data such as session identifiers, access tokens, passwords, and secrets should not be recorded directly, and logging failures should not affect application behavior. CTA query propagation should avoid blindly copying credential-like params, and public tracking endpoints should fail open.
- Google Analytics UTM guidance identifies `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content` as campaign attribution fields. These match the backend's current public tracking schema.
- Parnas/Martin design guidance supports hiding change-prone decisions behind modules. The change-prone decision here is not visual landing-page markup; it is the marketing attribution/query handoff contract, so it belongs in a small shared frontend attribution helper.

### 2026-05-14 - SecretWaifuWEB Source Evidence

- `/lp-chat` records a visit as `landingPageKey='lp-chat'`, `variantKey='ahri-chat-preview'`, and `routePath=pathname`, then builds a CTA href from current params plus `openSignUp=1` only.
- `/lp-1` has the same shape: it records `landingPageKey='lp-1'`, `variantKey='control'`, then sets only `openSignUp=1` on the CTA href.
- The homepage reads `sw_landing_page` and `sw_landing_page_name` if present; otherwise it tracks the visit as `home`.
- The homepage currently records a new visit on mount. Backend registration/OAuth attribution then selects the most recent visit by `lastVisitedAt`, so a homepage modal visit can steal conversion credit from the original landing page.
- `/s/[key]` short URL resolution already appends `sw_short_url`, UTM defaults, `sw_landing_page`, and `sw_landing_page_name` to its redirect. Short-url entry is mostly correct for landing-page identity, but the downstream landing-page CTA can still navigate to homepage and let homepage become latest attribution.
- The backend attribution model tracks variants, but current admin reporting is primarily landing-page and short-url-target based. Preserving original landing-page identity is mandatory; preserving original variant identity is preferable but must avoid mutating the variant `routePath` to `/?openSignUp=1`.
- `/landing-pages/track-visit` already uses `runPublicTrackingPersistence`, so visit tracking fails open. `/landing-pages/track-signup-click` does not use that wrapper today; frontend catches failures, but the public endpoint itself can still return a tracking failure.
- AI-VRM and `squirclesystem-core` scans found no relevant `lp-chat`, `sw_landing_page`, `sw_short_url`, `openSignUp`, or landing-page tracking dependencies. This appears to be a SecretWaifuWEB-only attribution fix.

### 2026-05-14 - Current Attribution Assessment

- Correct: Backend visit upsert normalizes landing page, variant, route path, campaign fields, short URL, referrer host, user agent, and updates visit counts by visitor plus attribution key.
- Correct: Short-url redirects preserve short-url and landing-page identity for the first target page.
- Correct: Header opens the signup modal from `/?openSignUp=1` and sends signup-click tracking when the modal opens on `/`.
- Incorrect: Direct `/lp-chat` CTA does not preserve landing-page identity into the homepage handoff.
- Incorrect: Direct `/lp-1` CTA has the same issue.
- Risky: Adding only `sw_landing_page` would credit the landing page but create a second homepage visit as the latest attribution; preserving the original landing-page visit is cleaner.
- Risky: Blindly preserving all query params from landing page to homepage can propagate credential-like params. The current code does this; a production fix should prefer an explicit allowlist and documented exceptions.

### 2026-05-14 - Baseline Verification

- Frontend `npm run lint` passed.
- Frontend `npx tsc --noEmit` passed.
- Frontend `npm run build` passed.
- Backend `npm run typecheck` initially failed because Prisma Client had not been generated after `npm ci`, not because of source errors.
- Backend `npm run prisma:generate` passed.
- Backend `npm run typecheck` passed after Prisma generation.
- Backend `npm run test:quota` passed with 33 tests, including the public tracking persistence tests.

### 2026-05-14 - Plan Artifact

- Wrote implementation plan to `Backend/docs/lp-chat-attribution-fix-plan-2026-05-14.md`.

### 2026-05-14 - Open Decisions Resolved

- Approved the explicit `sw_landing_handoff=1` model.
- Approved frontend deterministic test tooling through a narrow `tsx`-backed test script.
- Approved preserving common ad click IDs through the CTA handoff: `gclid`, `fbclid`, `ttclid`, and `msclkid`.
- Clarified that current source does not model those ad click IDs as backend/reporting fields. They will be preserved in the frontend handoff allowlist only, while UTM fields and `sw_short_url` remain the structured attribution fields for this fix.

### 2026-05-14 - Implementation Notes

- Added `Frontend/src/lib/landing-attribution.ts` as the single frontend owner for the signup handoff contract, campaign field reads, route-path sanitization, and common ad click ID allowlist.
- Replaced blind CTA query forwarding in `/lp-chat` and `/lp-1` with `buildLandingSignupHref`. The helper now forwards only UTM/source fields, `sw_short_url`, and common ad click IDs, then sets `openSignUp=1`, explicit landing identity, and `sw_landing_handoff=1`.
- Updated the homepage attribution effect to skip `trackLandingVisit` only for complete landing signup handoffs. Ordinary homepage visits, including `/?openSignUp=1` without the handoff marker, still track as homepage visits.
- Wrapped `/landing-pages/track-signup-click` in `runPublicTrackingPersistence`, matching `/landing-pages/track-visit`, so public signup UX remains fail-open if attribution persistence fails.
- Added frontend helper coverage through `npm run test:landing-attribution` and backend route coverage by adding `src/routes/landing-page-routes.test.ts` to `npm run test:quota`.

### 2026-05-14 - Verification After Implementation

- Frontend `npm run test:landing-attribution` failed first because `landing-attribution.ts` did not exist, then passed after implementation: 6 tests, 0 failures.
- Backend `npx tsx --test src/routes/landing-page-routes.test.ts` failed first with `500 !== 201`, then passed after wrapping signup-click tracking fail-open.
- Frontend `npm run lint` passed.
- Frontend `npx tsc --noEmit` passed.
- Frontend `npm run build` passed; `/lp-1` and `/lp-chat` were included in the production route output.
- Backend `npm run prisma:generate` passed.
- Backend `npm run typecheck` initially caught an unsafe test stub cast; after fixing the test type, it passed.
- Backend `npm run test:quota` passed: 34 tests, 0 failures.
- `git diff --check` passed with only Git CRLF normalization warnings from the Windows checkout.
- Browser smoke on local Next production server at `127.0.0.1:7010` confirmed:
  - `/lp-chat?utm_source=test&utm_medium=cpc&utm_campaign=cta&gclid=abc` CTA navigates to `/?utm_source=test&utm_medium=cpc&utm_campaign=cta&gclid=abc&openSignUp=1&sw_landing_page=lp-chat&sw_landing_page_name=Ahri+Chat+Preview+Landing+Page&sw_landing_handoff=1`.
  - The signup modal opens after the `/lp-chat` CTA, and only one `track-visit` request fires for the original `/lp-chat` visit during the handoff.
  - `/lp-1?utm_source=test&utm_medium=cpc&utm_campaign=cta&msclkid=ms1` CTA navigates to a homepage signup URL preserving `msclkid` and `lp-1` identity, opens signup, and only one `track-visit` request fires for the original `/lp-1` visit.
  - A normal `/?utm_source=test&openSignUp=1` homepage load without `sw_landing_handoff=1` still sends a homepage `track-visit` request with route path `/`.
