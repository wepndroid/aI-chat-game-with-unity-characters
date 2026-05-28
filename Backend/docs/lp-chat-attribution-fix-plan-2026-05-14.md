# LP Chat Attribution Fix Plan - 2026-05-14

## Scope

- Target repository: `SecretWaifuWEB`.
- Worktree: `C:\Users\aless\.config\superpowers\worktrees\SecretWaifuWEB\dev-Davy-lp-chat-attribution-plan`.
- Base branch: `origin/dev-Davy`.
- Goal: fix the signup CTA attribution loss for `/lp-chat`, verify adjacent attribution flows, and keep the implementation production-grade.
- This plan is research and implementation planning only. No runtime behavior has been changed yet.

## Source Findings

### Confirmed Incorrect

- `/lp-chat` records its own visit as `landingPageKey='lp-chat'` and `variantKey='ahri-chat-preview'`, then sends the signup CTA to `/?openSignUp=1` without a landing-page handoff.
- `/lp-1` has the same issue: it records `landingPageKey='lp-1'` and `variantKey='control'`, then sends only `openSignUp=1`.
- The homepage records a new visit on mount. Backend signup attribution selects the latest visit by `lastVisitedAt`, so the homepage modal visit can become the signup attribution instead of the original landing page.
- `/landing-pages/track-signup-click` is not wrapped in the existing fail-open public tracking persistence helper, unlike `/landing-pages/track-visit`.
- The current CTA helpers copy all query parameters from the landing page into the homepage URL. That is risky because token-like or credential-like query values could be propagated unnecessarily.

### Confirmed Correct

- Direct landing-page visit tracking captures landing page, variant, route path, campaign fields, short URL, referrer host, user agent, and visit counts.
- Short URL redirects append `sw_short_url`, UTM defaults, and landing-page identity to the target URL. First-hop short URL attribution is mostly correct.
- The header opens the signup modal from `/?openSignUp=1` and sends signup-click tracking when the modal opens on `/`.
- Backend registration and OAuth flows attach the latest landing attribution after account creation.
- AI-VRM and `squirclesystem-core` source scans found no relevant coupling for this attribution fix.

## Research Constraints

- Keep `useSearchParams` inside client components with existing Suspense page boundaries; do not flatten routes into unnecessary client-only pages.
- Use `URLSearchParams` for query construction rather than hand-built strings.
- Preserve cookie-based visitor attribution by keeping tracking API calls credentialed.
- Treat analytics/tracking persistence as fail-open: attribution failures must not block signup or public page flows.
- Hide the change-prone attribution handoff contract behind a small shared module rather than duplicating query logic in every landing page.
- Prefer an explicit allowlist of marketing parameters over blind query forwarding.
- Preserve common ad click IDs through the signup handoff, but do not treat them as first-class backend reporting fields in this fix.

Sources used:

- Next.js `useSearchParams`: https://nextjs.org/docs/app/api-reference/functions/use-search-params
- MDN `URLSearchParams`: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
- MDN Fetch credentials: https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Google Analytics campaign URL parameters: https://support.google.com/analytics/answer/10917952
- Robert C. Martin, Single Responsibility Principle: https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html
- David L. Parnas, On the Criteria To Be Used in Decomposing Systems into Modules: https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf

## Proposed Architecture

### 1. Add a shared frontend attribution helper

Create `Frontend/src/lib/landing-attribution.ts`.

Responsibilities:

- Define public query keys:
  - `openSignUp`
  - `sw_landing_page`
  - `sw_landing_page_name`
  - `sw_landing_handoff`
  - `sw_short_url`
  - supported UTM keys
  - common ad click IDs: `gclid`, `fbclid`, `ttclid`, `msclkid`
- Build signup CTA hrefs through a single helper:
  - input: current search params, target path, landing page identity.
  - output: a sanitized homepage signup URL with `openSignUp=1`, landing identity, and explicit handoff marker.
- Read campaign attribution fields for visit tracking.
- Build stable tracked route paths by stripping modal, UTM, short URL, and handoff query params.
- Detect a landing signup handoff on the homepage.

The helper should include focused documentation explaining that `sw_landing_handoff=1` means "open signup on the homepage without creating a replacement homepage visit, so the original landing visit remains the conversion source."

### 2. Refactor `/lp-chat`

Change `Frontend/src/components/landing/lp-chat-page.tsx` to:

- Replace local `preserveAttributionParams` with `buildLandingSignupHref`.
- Use the shared campaign reader for `trackLandingVisit`.
- Keep the visual page and Suspense route structure unchanged.

Expected behavioral change:

- The CTA preserves `/lp-chat` identity and does not rely on homepage fallback attribution.

### 3. Refactor `/lp-1`

Change `Frontend/src/components/landing/lp-1-page.tsx` the same way.

Expected behavioral change:

- `/lp-1` direct signup CTA gets the same attribution fix, avoiding a second hidden bug.

### 4. Refactor homepage attribution

Change `Frontend/src/components/home/home-page.tsx` to:

- Use the shared route-path and campaign helpers.
- Skip `trackLandingVisit` when `isLandingSignupHandoff(searchParams)` is true.
- Continue to open the signup modal through the existing header logic.
- Continue tracking ordinary homepage visits when there is no landing signup handoff.

Expected behavioral change:

- Navigating from `/lp-chat` or `/lp-1` to `/?openSignUp=1&sw_landing_handoff=1...` opens signup without creating a newer homepage visit.
- Signup click and registration/OAuth attribution attach to the original landing-page visit already stored in the backend.

### 5. Harden signup-click tracking endpoint

Change `Backend/src/routes/landing-page-routes.ts`:

- Wrap `/landing-pages/track-signup-click` in `runPublicTrackingPersistence`, matching `/track-visit`.
- Return a safe `{ tracked: false }` result if persistence fails.

Expected behavioral change:

- Public signup UX is not blocked by non-critical tracking persistence failures.

### 6. Keep short URL behavior mostly unchanged

Optional cleanup only:

- Reuse shared query key constants where practical.
- Do not change short URL weighting, redirect selection, or backend attribution semantics in this fix.

## Test Plan

### Frontend unit tests

Add focused tests for `landing-attribution.ts`.

Cases:

- `/lp-chat` CTA href contains `openSignUp=1`, `sw_landing_page=lp-chat`, page name, handoff marker, and allowed UTM fields.
- `/lp-1` CTA href contains `openSignUp=1`, `sw_landing_page=lp-1`, page name, handoff marker, and allowed UTM fields.
- Common ad click IDs `gclid`, `fbclid`, `ttclid`, and `msclkid` are preserved through the handoff.
- Disallowed parameters such as `token`, `session`, `password`, `authorization`, and arbitrary unknown keys are not copied.
- `isLandingSignupHandoff` only returns true when handoff marker, `openSignUp`, and landing-page key are present.
- `buildTrackedRoutePath` strips tracking, UTM, modal, OAuth cleanup, and handoff keys from analytics route identity.

Open decision:

- The frontend package currently has no test script or `tsx` dev dependency. Add a small `test:landing-attribution` script and `tsx` dev dependency, or keep verification to lint/typecheck/build plus browser smoke.

### Backend tests

Preferred:

- Add a route-level regression test for `/landing-pages/track-signup-click` fail-open behavior if the existing route wiring can be tested without a broad app harness.

Fallback:

- Rely on the existing `runPublicTrackingPersistence` unit tests plus a source-level route review if route-level setup is too invasive for this small fix.

### Manual/browser verification

Run the frontend locally and verify:

- `/lp-chat?utm_source=test&utm_medium=cpc&utm_campaign=cta` renders.
- The primary CTA href includes the landing identity and handoff marker.
- Clicking the CTA lands on `/` and opens the signup modal.
- The homepage does not send a replacement visit during that handoff.
- `/lp-1` behaves the same way.
- A normal homepage load without handoff still tracks a homepage visit.

### Required commands before merge

Frontend:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

Backend:

```powershell
npm run prisma:generate
npm run typecheck
npm run test:quota
```

If frontend test tooling is added:

```powershell
npm run test:landing-attribution
```

## Baseline Verification Already Run

Frontend:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.

Backend:

- Initial `npm run typecheck` failed only because Prisma client had not been generated after `npm ci`.
- `npm run prisma:generate` passed.
- `npm run typecheck` passed after Prisma generation.
- `npm run test:quota` passed: 33 tests.

## Open Decisions For Alessandro

1. Approve the explicit `sw_landing_handoff=1` model?

   Decision: approved. This intentionally skips recording a second homepage visit during a landing-page signup handoff so the original `/lp-chat` or `/lp-1` visit remains the signup attribution source.

2. Which extra ad click IDs should the CTA allowlist preserve?

   Decision: preserve common ad click IDs. The allowlist is UTM fields, `source`, `sw_short_url`, `gclid`, `fbclid`, `ttclid`, `msclkid`, landing identity, handoff marker, and `openSignUp`. These click IDs are preserved for downstream continuity but are not added to backend reporting fields in this fix.

3. Should I add deterministic frontend test tooling for this helper?

   Decision: approved. Add `tsx` as a dev dependency and a narrow `test:landing-attribution` script. This is a small package change but gives deterministic regression coverage for the core attribution contract.
