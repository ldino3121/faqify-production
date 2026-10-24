# Credential and dependency security review

This review supersedes the initial security findings in INTEGRATION_REVIEW.md. Work remains local on `integration/paddle-sandbox`. No exposed credentials were tested, no catalog command was run, and no credentials or account settings were rotated/changed.

## Credential cleanup

Removed 19 credential-shaped literal occurrences from 13 tracked files: 11 Google/Gemini API-key occurrences, seven OpenRouter API-key occurrences, and one Supabase JWT with a decoded `service_role`. Counts are occurrences, not independently verified active keys. Actual values were never printed. Historical documents now warn against copying old hardcoded fallback examples. Known private-key patterns and privileged JWTs are absent from the scanned working source; this is a targeted source scan, not proof that all Git history or binaries are clean.

- `deploy-functions.js` now uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, works as ESM, and requires `--allow-legacy-schema-write`. Its old SQL can conflict with the Paddle migration: preserve for reference, do not run it as rollout tooling.
- `DEPLOY-READY-FUNCTION.ts` uses backend Gemini environment variables only and fails if absent. It is marked historical; deploy the maintained function instead.
- `deploy-env-vars.js` reads `DEEPSEEK_API_KEY`; `deploy-permanent-api-fix.js` reads `OPENROUTER_API_KEY`. Both require explicit `--apply`, pass the secret through stdin instead of shell interpolation/command arguments, and suppress provider output. Neither was executed. The latter no longer generates/deploys an obsolete function or prints credential previews.
- `test-api-key-direct.html` no longer embeds a private key; its browser credential-test action is disabled before the network request.
- Tracked environment files were not copied, printed, or modified. A variable-name/pattern review found public Supabase anon keys rather than service-role literals in them. Remaining legacy anon JWTs are public client configuration, not privileged credentials.

## Required manual incident response

See [CREDENTIAL_ROTATION_CHECKLIST.md](CREDENTIAL_ROTATION_CHECKLIST.md) for the 2026-10-23 consumer inventory, names-only remote inspection, current provider dashboard procedures, compatibility blockers and ordered cutover. Rotation/revocation remains pending.

Do this through each provider dashboard; never paste replacement values into chat or source control. Nothing below was performed.

1. Supabase: replace the exposed service-role JWT wherever it is used with an appropriate backend secret, coordinate frontend/public-key and Edge Function compatibility, verify the replacement configuration, then deactivate compromised legacy API keys. Creating a new key alone does not invalidate the old JWT. Existing code still uses legacy runtime variables; plan the replacement before disabling them. Follow [Supabase's leaked-key procedure](https://supabase.com/docs/guides/getting-started/api-keys#rotate-a-leaked-or-compromised-key).
2. Google/Gemini: inventory exposed keys in AI Studio/Cloud Console, replace any still-active keys in backend secrets, revoke the exposed keys, restrict replacements to the required service and review usage/billing. See [Google's key management guidance](https://ai.google.dev/gemini-api/docs/api-key).
3. OpenRouter: revoke exposed active keys, replace only if the legacy integration remains needed, update backend secret storage, and set spending limits. Review activity/credit use. See [OpenRouter authentication guidance](https://openrouter.ai/docs/api_reference/authentication).
4. Coordinate removal from Git history, tags, forks, archives, old artifacts and logs after credential revocation. Current working-file cleanup does not erase prior commits. History rewriting and remote cleanup were not performed.

## Dependency fixes and scope

Ran `npm audit fix` without `--force`, then assessed and explicitly upgraded Vite and Vitest. The lockfile now includes Vite 6.4.5, Vitest 4.1.12, React Router DOM 6.30.6, Axios 1.20.0, PostCSS 8.5.31 and Rollup 4.64.12, alongside compatible transitive updates. The existing React SWC plugin supports Vite 6. Removed Vitest's unsupported `minWorkers`; `maxWorkers: 1` remains. CI stays on Node 20. The new catalog test suite is included in `npm test`, so the preserved workflow runs it automatically.

The initial audit reported 43 findings (two critical); compatible updates alone left 19; the assessed tooling major upgrades reduced this to **13 findings: five high, eight moderate, zero critical**. `npm audit --omit=dev` reports nine (five high, four moderate), but this includes build-only Tailwind dependencies because they are declared under `dependencies`. Neither audit count alone measures deployed browser exposure. Findings include transitive/metavulnerability counts, not 13 independent exploit paths.

| Remaining family | Actual use and exposure | Decision |
| --- | --- | --- |
| Tailwind 3 / chokidar / fast-glob / micromatch / braces (five high findings) | CSS build/watch tooling; trusted repository globs, not a browser request handler. Declared as production dependencies. | [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched release. Tailwind 4 removes the vulnerable chain but requires [PostCSS/CSS configuration migration and visual review](https://tailwindcss.com/docs/upgrade-guide). Deferred rather than blindly replacing the CSS pipeline. |
| postcss-selector-parser / postcss-nested / typography (three moderate findings) | CSS build tooling; typography is dev-only. | [Fixed in selector-parser 7.1.6](https://github.com/advisories/GHSA-rj75-hqrm-r3gf); the installed consumers require parser 6. Do not force a major transitive override or downgrade typography to bypass the audit. Address with a tested Tailwind/PostCSS migration. |
| React Router / DOM (two moderate findings) | Browser runtime. SSR hydration constructor advisory has no demonstrated SSR path in this Vite SPA; navigation advisory remains relevant if untrusted paths reach navigation APIs. | [Navigation](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) and [SSR hydration](https://github.com/advisories/GHSA-337j-9hxr-rhxg) fixes require 7.18+. Deferred: route transition/relative-path/lazy/auth/checkout navigation needs a focused major upgrade and browser regression pass. |
| Mammoth / argparse / sprintf-js (three moderate findings) | Mammoth is npm dev-only for document tests, but the Edge Function separately imports pinned `npm:mammoth@1.11.0` for production DOCX extraction. The argparse/sprintf chain is CLI formatting; the app does not pass user-controlled format strings to that CLI. | [sprintf-js has no patched release](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). npm's suggestion to downgrade Mammoth to 0.3.29 is not a compatible fix. Keep bounded uploads; assess upstream CLI dependency removal or replacement separately. npm lockfile audit does not cover the independent Deno import graph. |

Major upgrades assessed and applied: Vite 5→6 uses the existing Rollup-based configuration; [Vite 6 migration](https://v6.vite.dev/guide/migration.html) reviewed. Vitest 2→4 removes the old tinypool worker chain, includes the [mocker security fix](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), and supports Node 20; [Vitest 4 migration](https://v4.vitest.dev/guide/migration.html) reviewed. [Tinypool's two advisories](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) [require 2.1.2 to cover both issues](https://github.com/advisories/GHSA-85c8-ppgw-ccpr); that dependency is now absent. Vite 8 would additionally change bundler/tooling, and [Vitest 5 requires Node 22.12+](https://vitest.dev/guide/migration/); neither was needed for these fixes. Major Tailwind and Router changes remain explicit follow-up work.

## Catalog script

`scripts/setup-paddle.mjs` is sandbox-only. It accepts `PADDLE_SANDBOX_API_KEY` or the legacy `PADDLE_API_KEY` name, requires a sandbox key prefix, refuses live, and defaults to inspection. Both products and all prices are paginated including archived entries before any write. Name/description/tax/metadata checks recognize the existing metadata-free products. Price checks cover USD amounts, monthly versus one-time billing, no trial, external tax, status/type, regional overrides, unit quantity and 30-day access descriptions. Existing maximum quantity 100 is accepted because checkout always buys one unit. Duplicates, archived/conflicting candidates, incomplete responses, foreign pagination/redirects and partial matches fail closed. Explicit `--apply` only creates missing entries, then GET-verifies them; it never updates/deletes existing items. Provider body contents and credentials are not logged. Provisioning is not atomic; a provider failure after creation requires re-inspection, never a blind retry.

26 mock-only catalog tests cover reuse, conflicts, sandbox restrictions, pagination, zero-write inspection and verification of missing entries. No Paddle HTTP request was made during this task.

## Checks

- `npm ci`: passed against the updated lockfile.
- App typecheck: passed.
- Vitest: all 64 tests passed on Node 24 and Node 20 after the tooling upgrade.
- Catalog: all 26 tests passed on Node 24 and Node 20; no provider access.
- Lint: zero errors, 72 existing warnings.
- Production build: passed on Node 24 and CI-compatible Node 20 with placeholder public configuration. Existing tracked `NODE_ENV=production` produces a Vite warning; the manual vendor chunk is empty after the dependency refresh. Neither is a build failure.
- Modified Node scripts pass syntax checks; targeted private-credential and JWT-role scans pass. `git diff --check` passes.
- Browser checkout/provider connectivity, deployed behavior and credential validity were not tested. Maintained Edge Function sources were not changed in this cleanup; the earlier 16-function Deno checks remain the applicable source check.

## Browser diagnostic files recommended for removal from web serving

These files were identified, not deleted. Repository-root HTML is reachable through the Vite development server (currently bound to all interfaces); it is not automatically copied into Vercel's `dist`. Do not serve the repository root as a static website. These standalone pages bypass normal app navigation and some offer direct database mutation/RPC or billing operations. Retire them or move any needed diagnostic logic into authenticated backend tooling.

Priority examples: `test-api-key-direct.html`, `assign-business-plan.html`, `assign-pro-plan.html`, `execute-database-cleanup.html`, `apply-database-fix.html`, `fix-database-limits.html`, `fix-subscription-columns.html`, `fix-usage-sync.html`, `fix-user-sync.html`, `update-current-user-to-pro.html`, and the `debug-*.html` / payment test pages.

The following inventory lists root HTML with database/network code (static inspection only):

- `COMPLETE-SYSTEM-TEST.html`
- `CURRENT-STATE-ANALYSIS.html`
- `FINAL-SYSTEM-TEST.html`
- `INTERNATIONAL-STRATEGY-TEST.html`
- `LIVE-PAYMENT-TEST.html`
- `add-missing-columns.html`
- `apply-database-fix.html`
- `assign-business-plan.html`
- `assign-pro-plan.html`
- `check-database-data.html`
- `check-subscription-dates.html`
- `check-user-subscription.html`
- `comprehensive-payment-analysis.html`
- `comprehensive-razorpay-test.html`
- `debug-api-key.html`
- `debug-collection-97d2aa8e.html`
- `debug-content-extraction.html`
- `debug-edge-function-error.html`
- `debug-faq-count-flow.html`
- `debug-faq-creator.html`
- `debug-faq-flow.html`
- `debug-razorpay-issue.html`
- `debug-save-error.html`
- `debug-signup-error.html`
- `debug-subscription.html`
- `debug-user-data.html`
- `debug-widget-api.html`
- `deploy-expiry-fix.html`
- `diagnose-subscription-issue.html`
- `execute-database-cleanup.html`
- `fix-database-limits.html`
- `fix-oauth-production.html`
- `fix-subscription-columns.html`
- `fix-usage-sync.html`
- `fix-user-sync.html`
- `get-razorpay-plan-ids.html`
- `quick-faq-count-test.html`
- `test-api-key-direct.html`
- `test-auth-issues.html`
- `test-basic-functionality.html`
- `test-database-functions.html`
- `test-embed-generation.html`
- `test-enhanced-content-extraction.html`
- `test-exact-faq-count-fix.html`
- `test-faq-count-functionality.html`
- `test-faq-generation.html`
- `test-faq-save.html`
- `test-fixes.html`
- `test-frontend-sync.html`
- `test-new-embed-system.html`
- `test-oauth.html`
- `test-payment-system.html`
- `test-razorpay-integration.html`
- `test-scraping-urls.html`
- `test-signup-flow.html`
- `test-subscription-flow.html`
- `test-subscription-system.html`
- `test-user-status.html`
- `test-widget-issue.html`
- `update-current-user-to-pro.html`
- `update-domain-to-faqify-app.html`
- `validate-oauth.html`

`public/verify-changes.html` is actually copied into `dist` and should be removed from production output as an obsolete diagnostic page. The three public icon/favicon generator pages are maintenance utilities and can also be kept outside the production public directory; no private credentials or provider requests were found in those four public pages. No browser diagnostic file was removed in this task.

No migration, deployment, commit, push, rotation, Vercel change or Paddle mutation was performed.
