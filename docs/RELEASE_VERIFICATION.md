# Paddle sandbox release verification — 2026-10-24

Branch: `integration/paddle-sandbox`. Production cutover has **not** occurred. Gemini rotation is explicitly deferred; current Gemini configuration is preserved. No new credential-rotation audit, hosted database mutation, function deployment, secret installation, webhook activation, provider transaction or purchase was performed.

## Completed locally

- `npm ci`, application typecheck, production build: pass. Builds default to read-only; Vercel Preview cannot enable shared-database writes. Production builds from non-main branches are refused.
- 90 Vitest tests, 26 catalog tests and 3 metadata-preflight tests: **119 pass**. Cohort tests deny nonmembers/live fulfillment, deny enrollment by clients/service_role, and verify rejection rolls back event/payment ledger writes. Preview tests verify writes/functions/auth/non-status RPCs never reach fetch.
- Lint: zero errors, 72 existing warnings.
- Exact release Deno manifest: **25 entrypoints pass**. **17 complete captured original-function preparation bundles pass** strict checking. Broader inspection also found pre-existing type errors in excluded `get-analytics` and `health-check`; neither is part of this release or changed/deployed here.
- Three maintenance PostgreSQL concurrency scenarios: pass (transaction barrier, stale snapshot, waiting writer). Synthetic schemas only.
- Original Chromium editor walkthrough: late generation during freeze retains and exports the draft; a collection/FAQ split save failure retains and exports the draft; stale generation is rejected without a write. Original source is main `172555786c63a7b49b9efc8da66f7a67bb65e5f4`, exercised with synthetic clients, all external browser traffic blocked. This proves local browser behavior, not the state of a user's live tab.
- Recreated isolated Supabase PostgreSQL 17 restore from the **existing** 2026-10-21 snapshot. Installed maintenance before preflight (zero blockers), applied the revised single migration while frozen, preserved **62 COPY blocks / 1,747 original rows**, and passed seven actual-schema SQL acceptance groups plus five concurrent save/quota/checkout/event/payment scenarios. This does not claim a fresh production snapshot.
- Built preview inspected in isolated Chromium: landing page renders, checkout is blocked before Paddle.js, zero browser exceptions; only the read-only status RPC was attempted. External traffic was blocked by the harness.
- After SQL/concurrency acceptance, all 1,747 original rows still match and all four original sequence states match.
- Safe captured-source inspection found awaited generation retries/crypto chains and no unawaited provider/background work. Added guard coverage for `assign-pro-plan`, contact and error handlers. Assignment now requires admin authorization; remote diagnostics have admin-only, presence-only replacements.

## Read-only remote verification

- All 25 Supabase function versions/gateway settings match the private capture. Exact replacement scope and gateway values are in `supabase/rollout/release-manifest.json`.
- All seven new Paddle secret names remain missing in Supabase; `GEMINI_API_KEY` remains present. Values were not displayed or modified.
- Existing four sandbox prices validated (Pro $9, Business $29; monthly and one-time, USD, external tax, no trials). Existing active sandbox client token reused. Destination `ntfset_01m5mgbrqtydk09vv9456hnvvs` read-back is inactive with the ten handler events. No catalog changes or duplicate entities.
- Configuration prepared outside Git in `/Users/carbonface/Backups/faqify/release-preparation-20261024`: `supabase-sandbox.env`, `vercel-preview.env`, `vercel-production-cutover.env`. Restricted permissions; no remote installation. Preview app origin awaits its actual URL.
- Existing Git credential has repository push/admin access. GitHub default branch is main; observed production deployment source is main. Repository Actions secret/variable inventories are empty. GitHub has a Production environment. The owner confirmed in the Vercel dashboard screenshot that Production tracks `main`. Other private Vercel settings and Production variable presence remain unverified without authenticated access.

## Pending prerequisites / limits

- Fresh pre-window backup and isolated restore verification completed at 2026-10-24 14:22 UTC; details below. A final frozen refresh or explicitly reconciled delta is still required before migration.
- Owner-approved account verified read-only: one confirmed active account/profile and one consistent active Free subscription; no provider billing links, auto-renewal or payment records. It has an admin role and one existing FAQ collection, so ordinary-user permission and clean Free onboarding tests need a separate non-admin account. Cohort enrollment has not occurred.
- Vercel dashboard: verify Settings → Git connected repository; Settings → Environments → Preview branch tracking (Production `main` is owner-confirmed); Build and Deployment overrides/ignored-build rules; automatic system variables; Environment Variables scopes/overrides; Deployment Protection; and production domain auto-assignment/promotion controls. GitHub production records are not proof of private settings.
- Exposed Supabase/OpenRouter follow-up remains documented; no rotation is authorized. **Gemini rotation is deferred by the owner and is follow-up work**, not a new audit gate in this task. Existing dependency findings remain in SECURITY_REVIEW; no unrelated major upgrade was attempted.
- Standalone root diagnostic HTML remains excluded from the Vite `dist` build; do not serve the repository root publicly. Retirement/removal is separate from this rollout and no unrelated files were deleted.

## Acceptance matrix

All hosted mutation tests below remain **pending coordinated cutover**. Existing local tests never establish provider/hosted acceptance.

| Area | Completed evidence | Required after cutover |
|---|---|---|
| Login/session/redirects | App auth unit tests; preview auth writes blocked | Dedicated-account login, refresh, logout, existing sessions and gateway checks |
| URL/text/document generation | Generation/quota/document extraction tests; captured function typechecks | Actual Gemini URL, pasted text, PDF/DOCX generation with current configuration |
| Save/edit/delete/export | Atomic SQL save/replay/ownership; export tests; old draft export | Normal UI lifecycle, uncertain-response retry, editor draft preservation |
| Existing FAQs/embeds | Original-row preservation and widget tests | Existing published embed URLs and FAQ reads during drain/freeze/reopen |
| Free limits | SQL quota/ownership/atomicity checks | Free account limits without billing bypass |
| Four prices | Read-only catalog validation; price parsing tests | Pro monthly + one-time, Business monthly + one-time sandbox checkout; correct USD/external tax/allowance |
| Webhook retries/grants | Signature/core tests and concurrent event/payment deduplication | Signed provider delivery/replay, consumed quota unchanged on duplicate, correct 100/500 grant |
| Cancellation/expiry | SQL lifecycle/one-time/reset tests | Scheduled/effective cancellation, recurring period boundary, 30-day one-time expiry |
| Refunds | SQL approved full-refund behavior | Pending versus approved refund, access revoked once; no grant on unrelated adjustment |
| Customer portal | Server-owned customer lookup and cohort restriction reviewed | Correct account portal, cross-account/nonmember rejection, cancellation changes synchronized |
| Recovery | Local maintenance/lease/barrier tests; runbook commands | Frozen failure drill, new-schema-compatible forward recovery, deferred-event reconciliation |

Use sandbox test cards only after the handler/signing secret/cohort/frontend are ready and the destination is separately authorized for activation. Do not run simulations against the shared database as a substitute for ownership-aware hosted tests.

## Artifact fingerprints

- Billing migration SHA-256: `6c6fef50791e72ae3513528be442a905910b2eb46d7efbf5733fcae259b95091`.
- Maintenance SQL SHA-256: `e7891c17dc20e6c4ec36bc04413e4f1b1134c11c235ad78578a4bde9b57a2f3e`.
- Release manifest SHA-256: `2564f5f4af8bdc6b73143a59ad8bb3e60677a7080bc8e392bfa1cb5e1b288df9`.

See [PADDLE_SANDBOX_DEPLOYMENT_RUNBOOK.md](PADDLE_SANDBOX_DEPLOYMENT_RUNBOOK.md) for exact ordered preparation, drain/freeze, migration, function/configuration staging, cohort acceptance and recovery commands. Stop before production changes.

## Branch push and hosted build evidence

Reviewed integration HEAD `2f52922debeaf0b9ef5ad8f020209d5d05f843ae` was pushed only to `integration/paddle-sandbox`. Main remained `172555786c63a7b49b9efc8da66f7a67bb65e5f4`.

Latest [GitHub CI](https://github.com/ldino3121/faqify-production/actions/runs/40097549357/job/120882859734) and Vercel build both succeeded. Vercel created GitHub deployment `7299137361`, environment **Preview**: https://faqify-production-5gctbxrtk-gaurav-walias-projects.vercel.app . Access redirects to Vercel authentication; the hosted UI remains uninspected. No protection settings were changed. Preview-on-push is observed for this branch. Production tracks `main`, as confirmed by the owner from the dashboard screenshot.

The first CI failure (`vi.stubEnv` boolean versus string) was corrected in the pushed commits. The latest successful CI supersedes the earlier pending follow-up status; no unchanged local tests were repeated.

## Latest pre-cutover inspection

Read-only authenticated Supabase inspection on 2026-10-24 confirmed all seven Paddle names above are missing and `GEMINI_API_KEY` is present. The cohort table and rollout-control function are not installed; migration version `20261022000000` is not recorded. No production change was made.

Private database credentials were supplied through the corrected masked Terminal prompt; fresh backup/restore is now verified. The owner subsequently supplied one approved UUID; read-only eligibility checks are recorded below. No existing account was selected or enrolled. Vercel access is unavailable; its Production variables are **unknown**, not confirmed missing. The exact supplied UUIDs must be checked using aggregate-only results for account existence, Free eligibility and absence of existing paid/provider subscriptions before enrollment.

See the runbook readiness gate: no production mutation or webhook activation is authorized by this inspection.


## Fresh backup and restore — completed 2026-10-24

Protected backup location: `/Users/carbonface/Backups/faqify/release-preparation-20261024`. Export completed at `2026-10-24T14:22:13Z` from the explicitly confirmed production Session pooler using CA-validated TLS and read-only connections. Exported roles without passwords, a consistent custom database archive, and derived schema/data/migration-history exports. Checksums verified; directory mode 700 and exported files mode 600. Temporary `.database.env` and readiness marker removed after successful export.

Restored the new archive into a separate Supabase PostgreSQL 17 container, `faqify-fresh-backup-20261024`, with networking disabled, no published ports and scheduled cron execution disabled. Used the previously reviewed local extension/bootstrap adaptations. The container is now stopped; its isolated volumes are retained.

Verification: **62 table COPY blocks / 1,750 rows**, **four sequence states**, migration-history data, roles and role grants all match. **733 schema object blocks match** after normalizing owner quoting and ordering (15 default-ACL blocks differ only by statement order). Raw schema SQL ordering differs; the object/permission comparison establishes equivalence. Compared with the prior snapshot, source schema has zero added, removed or changed object blocks. No repository migration was applied in this backup verification; unchanged application tests were not repeated.

Private evidence: `backup-status.json`, `verification-report.json`, `fresh-schema-drift.json` and the archive/export files in the protected backup directory. Logical dumps do not include Storage object bytes or role passwords. This pre-window snapshot does not replace the final frozen cutover backup.

The helper supplied neither approved test-account UUIDs nor Vercel access. Only the approved UUID has been requested from the owner; cohort eligibility remains pending. Gemini was unchanged. No production migrations, deployment, secret changes or webhook activation occurred.


## Approved sandbox account — read-only verification

The owner-supplied UUID is stored only in protected release inputs/evidence outside Git (`sandbox-account-verification.json`). Authenticated read-only queries against the confirmed production project returned: one account, one profile, one confirmed account, zero deleted/currently banned accounts, one active subscription with both plan fields Free, zero provider subscription/customer/order links, zero auto-renewal flags and zero payment records. No plan or account setting changed.

This passes the existing-plan/billing-conflict checks for the approved sandbox billing candidate. Two limitations remain: one administrator role and one existing FAQ collection. Admin access makes this insufficient as the sole account for ordinary-user authorization/ownership acceptance. Under the pending migration, Free generation rejects another collection while an existing collection is present, regardless of the currently unused numeric quota. Preserve that collection; do not delete content or remove roles to force a test. Use a separately approved ordinary non-admin account for clean Free onboarding and permission tests.

The cohort table is not installed, so this is eligibility verification, not enrollment or checkout readiness. No purchase, RPC with side effects, migration, deployment, remote configuration or Gemini change was performed.
