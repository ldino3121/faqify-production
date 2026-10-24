# FAQify coordinated rollout — Paddle SANDBOX

Updated 2026-10-24. This document replaces the earlier preparation status. **Stop before production changes.** Gemini rotation is explicitly deferred: preserve `GEMINI_API_KEY` and the current fallback selection; rotation is follow-up work, not an activity in this release preparation. No credential rotation is performed.

## Target and immutable artifacts

- Supabase production project: `dlzshcshqjdghmtzlbma`, also selected for sandbox acceptance. This is not an isolated test database.
- Git repository: `ldino3121/faqify-production`; only `integration/paddle-sandbox` is authorized for commit/push. Never push or merge `main` in this step.
- Exact function/gateway manifest: [`supabase/rollout/release-manifest.json`](../supabase/rollout/release-manifest.json), 25 release entrypoints. Preserve each captured gateway value except the explicitly reviewed `track-analytics` true→false change; its handler validates private events and restricts public events.
- Original-schema preparation: `supabase/rollout/maintenance.sql`.
- One pending billing migration: `supabase/migrations/20261022000000_paddle_and_atomic_faq_saves.sql`. Do not replay historical migrations or use blanket `db push`.
- Private preparation root: `/Users/carbonface/Backups/faqify/release-preparation-20261024` (directories 700/files 600). Captured source, configuration, database data, logs and draft-test exports stay outside Git.
- Latest tests and open gates: [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md). Earlier rehearsal/security reports remain historical evidence, not hosted acceptance.

## Configuration by scope

Prepared files are **not installed remotely**. Never print their contents or put private values under `VITE_` names.

| Configuration | Preview | Production, only at reviewed cutover |
|---|---|---|
| `VITE_BILLING_PROVIDER` | `paddle` | `paddle` |
| `VITE_PADDLE_ENVIRONMENT` | `sandbox` | `sandbox` |
| `VITE_PADDLE_CLIENT_TOKEN` | Existing active sandbox token, securely prepared | Same existing sandbox token |
| `VITE_PADDLE_ENABLE_ONETIME` | `true` (UI only; purchases blocked) | `true`, backend cohort enforced |
| `VITE_FAQIFY_WRITES_ENABLED` | `false` | `true` after compatible backend/schema are ready |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Confirmed target/public configuration prepared | Preserve confirmed target/public configuration |
| `VITE_PUBLIC_APP_URL` | Actual assigned Preview origin; not yet known | `https://www.faqify.app` |
| `VITE_PUBLIC_SUPABASE_URL` | Optional; falls back to confirmed URL | Optional same fallback |
| `VITE_RAZORPAY_KEY_ID`, `VITE_TURNSTILE_SITE_KEY` | Existing public values prepared | Preserve existing public values |

`vercel-preview.env` and `vercel-production-cutover.env` are in the private root. Preview public app origin must be filled after its URL exists. Preview always compiles read-only unless Vercel identifies the build as Production AND Production explicitly enables writes. A Production build from any non-main Git branch is refused. Missing system variables fail closed. Check Vercel's automatic exposure of system environment variables. The read-only fetch boundary blocks auth mutations, every Edge Function call, REST writes and non-status RPCs; generation/checkout gates also reject before Paddle.js starts. It allows REST reads/status. This is a preview safety control, not an authorization substitute; database/RLS/handler controls remain required. Local builds also default read-only.

The backend file `supabase-sandbox.env` contains only these seven new names: `PADDLE_ENVIRONMENT`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRO_MONTHLY_PRICE_ID`, `PADDLE_PRO_ONETIME_PRICE_ID`, `PADDLE_BUSINESS_MONTHLY_PRICE_ID`, `PADDLE_BUSINESS_ONETIME_PRICE_ID`. All seven are currently missing remotely; do not overwrite unrelated secrets. The existing catalog key has previously verified checkout/portal runtime permissions; it is broader than the runtime minimum. Preserve Gemini, Razorpay, Resend and Supabase runtime settings. No live Paddle URL is permitted by this release's environment gate.

## Sandbox assets and access control

The existing Pro/Business products and all four USD/external-tax/no-trial prices were read-back verified and reused. Existing client token reused. Default payment link remains `https://www.faqify.app/checkout`; this route is not yet deployed.

Destination **`ntfset_01m5mgbrqtydk09vv9456hnvvs`** exists and is **inactive**, verified by read-back. URL: `https://dlzshcshqjdghmtzlbma.supabase.co/functions/v1/paddle-webhook`. Signing secret remains in the protected original `paddle-sandbox-secrets/ntfset_01m5mgbrqtydk09vv9456hnvvs.env` and the private release bundle. Do not create another destination or token.

Events: `transaction.completed`, `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.past_due`, `adjustment.created`, `adjustment.updated`.

Keep it inactive until its signing secret, handler and migrated database are installed and verified. Activation is a later production-cutover action requiring review. No transactions, provider simulations or purchases are part of this preparation.

The migration installs an **empty, operator-owned** `faqify_sandbox_cohort` table. Clients and service_role cannot read/enroll/change it. Only explicitly approved dedicated account UUIDs may be enrolled by the operator; none are invented or selected from user records. Verify those accounts are dedicated, initially Free, and have no existing paid/provider subscription before enrollment. Enrollment is allowed while frozen because this operator-only control table is excluded from application write guards.

`begin_paddle_checkout`, entitlement-changing fulfillment, checkout resume/cancel and customer portal require cohort membership. The `_ptxn` checkout route verifies signed-in ownership through the backend before opening Paddle.js. A direct client cannot call the backend-only grant RPCs. The release refuses live fulfillment. Unbound payments retry without granting quota; custom_data cannot select an arbitrary owner. Webhook retries are transactional and duplicate events/transactions do not refill consumed quota. Keep test accounts enrolled through cancellation/refund/reconciliation; removing membership prematurely intentionally blocks later entitlement changes and requires replay after correction. Stop purchases/drain before changing cohort membership. Other users retain normal FAQ access; they cannot receive sandbox entitlements through these paths.

## Captured original functions and old clients

All 25 current function sources were captured privately. Preparation wraps **17 existing mutation/provider entrypoints**, including newly covered `assign-pro-plan`, `send-contact` and `log-error`; no unrelated read-only widget/export functions are wrapped. `assign-pro-plan` additionally requires admin authorization. `test-env-vars` has an admin-only presence-only replacement. Neither endpoint was invoked.

Run the offline generator against the private per-function download root:

```sh
node scripts/prepare-rollout-functions.mjs \
  /Users/carbonface/Backups/faqify/dlzshcshqjdghmtzlbma/openrouter-audit-20261023T144049Z \
  /Users/carbonface/Backups/faqify/release-preparation-20261024/captured-NEW
```

It refuses an existing output and emits complete isolated bundles, preserving captured imports rather than combining conflicting shared versions. `captured-deployment-ready` is the reviewed local preparation. Legacy strict typing fixes are generated by `scripts/captured-compat.mjs`; runtime changes are bounded missing-configuration/file/auth guards and catch narrowing. Gemini configuration/model/generation behavior is retained. Awaited retry timers and crypto chains are covered by leases; no unawaited provider work was found in the captured handlers. Recheck function version/gateway drift immediately before deployment.

The original frontend lacks the new banner. Server-side statement guards protect all application public tables, including privileged/definer/cron writes, not just new clients. The guard uses transaction barriers and durable function leases. Leases do not time-expire: reconcile a crashed handler explicitly; never delete leases merely to force a freeze.

The isolated Chromium walkthrough of the original FAQCreator from main demonstrated retained/exportable generated FAQs after freeze and a split collection/FAQ save. It demonstrated stale generation rejection without a write. Synthetic responses were used; no provider/database request escaped the harness. The new editor remains mounted through maintenance, supports local draft export and same-ticket retry, and never automatically reloads. Browser crashes/navigation can still lose unsaved old-tab drafts. Notify users before the window and require export/finish confirmation.

## Coordinated cutover — review only, not executed

The commands below are exact operator patterns, not an invitation to run them before approval. Use the release commit recorded in RELEASE_VERIFICATION; record all deployed versions/gateway settings. Confirm current target and fresh preflight/history. Use private credentials, CA-validated TLS, short lock timeout and bounded statement timeout. No SQL output containing records may be shared.

1. **Prerequisites:** complete fresh backup/restore, Vercel production/staging settings review, cohort identity verification and exposed Supabase/OpenRouter follow-up decisions. Gemini rotation is deferred by the owner. Capture the current Vercel production deployment/domain mappings and function metadata. Prepare a production-environment frontend build with automatic domain assignment held. Do not promote a Preview-built read-only bundle as the production artifact.
2. **Original-schema preparation:** install `maintenance.sql` in `open / 0`. Deploy each captured original guarded bundle with the *captured* JWT setting from the manifest; add admin-only diagnostic hardening. Do not deploy migration-dependent integration generation functions yet. The private bundle must be the working directory for its specific function. For false gateway values add `--no-verify-jwt`; for true use an explicit matching config. Example:

   ```sh
   supabase functions deploy analyze-content --project-ref dlzshcshqjdghmtzlbma \
     --workdir /Users/carbonface/Backups/faqify/release-preparation-20261024/captured-deployment-ready/analyze-content
   ```

   Wait for pre-wrapper invocations to finish using platform logs, not only lease counts. Verify old-app compatibility while open/0.
3. **Drain:** run the first transition below. Block new generation/billing/webhooks, but let admitted work and old direct saves finish. Record/pause background schedules and external operator writes under approval. Check `status.sql`, zero leases, request completion and collection/FAQ/empty-collection aggregate deltas. If an old two-request save is interrupted, stay before migration and return to drain for completion or stop for explicit recovery. Never delete/merge partial collections.

   ```sql
   BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
   SELECT public.faqify_set_rollout('drain',0); COMMIT;
   -- Only after leases, old invocations and split saves are reconciled:
   BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
   SELECT public.faqify_set_rollout('frozen',0); COMMIT;
   ```

4. **Final backup:** while frozen, take the final consistent read-only archive and restore/rehearse that exact schema/data. Today's pre-window export, if available, still needs a final frozen refresh/delta check. Re-run metadata/history preflight. The backup procedure below is mandatory.
5. **Migration:** apply only `20261022000000_paddle_and_atomic_faq_saves.sql`, which has its own transaction and installs guards on new tables. Use `psql -X -v ON_ERROR_STOP=1 -f ...` against the privately confirmed target; do not combine independent fragments after a failure. Record version `20261022000000` exactly once in `supabase_migrations.schema_migrations` using the approved migration-history process after successful application; verify absence first. Do not rewrite historical rows. Preserve the write freeze.
6. **Backend/config:** install only the seven prepared secrets; deploy the 25 exact release entrypoints from `release-manifest.json`, preserving JWT settings. These are `analyze-content`, `track-analytics`, `create-checkout-session`, `manage-subscription`, `process-document`, `stripe-webhook`, `assign-pro-plan`, `create-razorpay-order`, `verify-razorpay-payment`, `create-razorpay-subscription`, `razorpay-webhook`, `debug-user-status`, `check-env`, `check-subscription-plans`, `fix-database-plans`, `test-env-vars`, `manage-razorpay-subscription`, `razorpay-subscription-webhook`, `admin-set-plan`, `send-contact`, `log-error`, `probe-razorpay`, `create-paddle-checkout`, `paddle-customer-portal`, `paddle-webhook`. Do not deploy `setup-razorpay-plans`, `health-check`, or change widget/export/get-analytics endpoints.

   ```sh
   supabase secrets set --project-ref dlzshcshqjdghmtzlbma \
     --env-file /Users/carbonface/Backups/faqify/release-preparation-20261024/supabase-sandbox.env
   # Repeat for each exact manifest entry, with the reviewed config.toml:
   supabase functions deploy FUNCTION_NAME --project-ref dlzshcshqjdghmtzlbma
   ```

7. **Frozen verification:** enroll only the confirmed dedicated cohort using operator SQL; verify membership by aggregate count. Stage Production frontend variables/build, keep the freeze, verify login/gateway/read-only FAQ/embed routes and blocked stale writes. Set minimum revision 1. Promote the compatible production build only through the separately approved Vercel process. Install signing secret/handler before later authorizing activation of the existing sandbox destination. No real money/live configuration.

   ```sql
   BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
   SELECT public.faqify_set_rollout('frozen',1); COMMIT;
   -- After compatible deployment, cohort, handler/signature and recovery verification:
   BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
   SELECT public.faqify_set_rollout('open',1); COMMIT;
   ```

8. **Controlled hosted acceptance:** run the matrix in RELEASE_VERIFICATION only with dedicated cohort accounts and sandbox test cards. Sandbox retries are finite; record/replay failed notifications deliberately after recovery. Verify both event and transaction deduplication. Restore schedules deliberately. Preserve unrelated FAQs/embeds and existing billing state; never test with real customers or cards.

## Backup and actual-schema rehearsal

The verified source snapshot remains `.../dlzshcshqjdghmtzlbma/20261021T210121Z`. A newly recreated isolated database has rehearsed the revised migration against it, preserving 62 table COPY blocks/1,747 rows. This is refreshed rehearsal evidence, not a fresh production backup.

The private Terminal prompt at `release-preparation-20261024/Enter release configuration.command` collects confirmed Session pooler details/password with hidden input and optional Vercel access/test-account UUIDs. No credential goes into command history/chat. Its backup helper uses Docker PostgreSQL clients, `verify-full` TLS and read-only transactions. After private input is ready, validate the CA file reference, export roles without passwords and one consistent custom archive, then derive schema/data/history exports from that archive. Preserve all logs/checksums privately. Do not reuse an old credential file or reset a password.

Restore into a new compatible network-disabled Supabase PostgreSQL container with no published ports, cron disabled and archived owner `postgres`. Apply reviewed local extension/bootstrap adaptations, install original-schema maintenance controls, run preflight, freeze, apply the single pending migration, compare original-column fingerprints, reopen only the isolated target at revision 1, and run `npm run test:restore`. Compare all original sequences and rows again after synthetic fixtures are cleaned. Stop the disposable container. Database logical dumps exclude actual Storage objects and role passwords; account for those separately in recovery planning.

## Recovery commands and boundaries

Before the billing migration, an aborted rollout can restore captured original compatible handlers and reopen **open/0**, after resolving in-flight work. The operator transition is `SELECT public.faqify_set_rollout('open',0);`. Preserve drafts and existing rows.

After migration, **never** lower minimum revision, restore direct frontend INSERT permissions, or roll back only the frontend to the original app. On a deployment failure:

```sql
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
SELECT public.faqify_set_rollout('drain',1); COMMIT;
-- Reconcile leases/providers/saves; then:
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
SELECT public.faqify_set_rollout('frozen',1); COMMIT;
```

If already frozen, leave it frozen. A timeout rolls back the transition: query `status.sql` to establish actual state. Re-deploy a known **new-schema-compatible** function/frontend artifact or forward fix, test read-only while frozen, and reopen open/1 only after review. Keep captures/Gemini configuration intact. A Vercel deployment rollback command is safe only after the specific deployment ID has been verified as new-schema compatible; no such prior production artifact exists yet, so do not invent a rollback ID.

There is no tested down migration. If database restoration becomes unavoidable, obtain separate destructive-recovery approval, archive failure-time data/provider ledgers, restore into an isolated recovery target, validate and reconcile legitimate intervening writes/payments before switching. Never overwrite production from an older snapshot or replay all payments blindly. Never delete FAQ rows/merge accounts to force recovery.

Vercel references: [environment scopes](https://vercel.com/docs/deployments/environments), [system build variables](https://vercel.com/docs/environment-variables/system-environment-variables). Current dashboard production branch/Preview configuration still requires authenticated verification; main is the observed GitHub production source, not proof of a private Vercel setting.
