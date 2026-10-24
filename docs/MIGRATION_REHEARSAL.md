# Paddle migration rehearsal against the exported production schema

The pending migration was revised against the verified database backup and applied only to a fresh, isolated local restore of PostgreSQL/Supabase 17.4.1.45. Production, Paddle, Vercel, deployed functions, and Git history were not changed. Backup data, database logs, row fingerprints, and credentials are outside this repository.

**2026-10-23 follow-up:** the pending migration now requires `supabase/rollout/maintenance.sql` and installs guards on its new tables. The original full-data rehearsal below predates this addition; its hash/proof is historical, not approval of the current artifact. Synthetic frozen-migration and real PostgreSQL concurrency checks pass; refresh the actual-data rehearsal before release. See [the deployment runbook](PADDLE_SANDBOX_DEPLOYMENT_RUNBOOK.md#5a-implemented-controls-and-old-session-handling).

## Schema findings and fixes

| Finding in the exported schema | Resolution |
|---|---|
| `user_subscriptions.current_period_end` is absent | Add nullable `timestamptz`. Existing rows retain all original values; no date is guessed or backfilled. Paddle completed payments populate the field, and resume uses the recorded paid period. The frontend already falls back to `plan_expires_at` for legacy accounts. |
| `usage_analytics.action_type` is required, without a default; `action` is optional | Atomic saves supply both fields with the already-supported `collection_saved` event. No new action type or historical analytics backfill is introduced. Admin analytics prefers `action_type`, then legacy `action`. |
| `user_subscriptions.user_id` is nullable, with an existing immediate UNIQUE constraint and FK to `auth.users` | Preserve the schema and records. The migration requires a valid immediate unique owner key and stops if it is absent. RPCs reject null owners; account RLS excludes other owners and unowned rows. No NOT NULL constraint, deduplication, merge, or deletion is imposed. |
| Some subscription owners have no optional profile row | New billing and generation tables reference `auth.users`, matching the existing subscription/collection/analytics ownership model. No profile rows are invented. |
| Status is text with a CHECK allowing only `active`, `inactive`, `cancelled`, `expired` | Preserve the type and legacy states; widen the named status CHECK for Paddle lifecycle states. Other checks are retained. |
| Provider subscription ownership lacked a unique key | Add a unique index on environment/subscription ID for non-null Paddle subscription IDs. Conflicting fulfillment rolls back its payment and event ledger writes. |
| Calendar resets could refill a still-valid one-time Paddle allowance | Exclude all Paddle entitlements from calendar resets. A new completed payment grants the next allowance. Legacy/Free reset behavior remains. |
| Existing ALL table grants include TRUNCATE, which bypasses RLS | Remove broad client grants on subscription, payment, collection and FAQ tables; grant the intended read/edit/delete operations back. Direct client billing writes, FAQ inserts, and TRUNCATE remain prohibited. |

Aggregate snapshot findings: eight subscription rows, zero null owners, zero duplicate non-null owner groups, three owners without profile rows, zero null usage fields, zero disagreements between non-null `plan_tier` and `plan_id`, and zero analytics rows. Individual accounts and records were not reported.

## Flow tracing

- The actual `handle_new_user` trigger creates profile/subscription rows with `ON CONFLICT(user_id) DO NOTHING`. Its owner key remains intact. The actual `sync_plan_id_from_plan_tier` and collection-limit triggers remain installed.
- `useSubscription` selects one row by authenticated owner; normalization falls back from nullable legacy `plan_tier` to `plan_id`. The quota and save RPCs now follow that same fallback.
- `analyze-content` authenticates the user, checks eligibility, calls `begin_faq_generation`, and stores completed generated content. `FAQCreator` calls `save_generated_faqs`; that transaction inserts collection/FAQ/analytics rows and charges quota once. Required insert columns were checked against the exported tables.
- `track-analytics` already calls the actual `track_simple_analytics` RPC, which writes required `action_type`. Export/embed inserts already supply both analytics fields. Those writers require no new event names or function changes.
- `create-paddle-checkout` resolves a configured price and calls the backend-only checkout RPC. A completed signed webhook maps a server-created intent or existing provider subscription to the account. `apply_paddle_event` atomically writes event/payment ledgers and entitlement state. Event IDs and transaction IDs deduplicate retries; the new provider owner index prevents ambiguous renewal ownership.
- Subscription lifecycle webhooks change state without granting quota. Pause/resume uses the recorded paid period; approved full refunds revoke access. Customer portal ownership is resolved from `paddle_customers` on the server.
- Legacy Razorpay handlers update existing subscription rows by user/provider ID and use `plan_expires_at`; their required transaction fields and existing source/payment-type values remain compatible. No legacy provider calls were made or billing reconciliation behavior rewritten.

## Validation and preservation

The revised metadata preflight has zero blocking result rows on the restored pre-migration schema. The final migration applies successfully as the restored `postgres` role in a transaction with normal triggers enabled. The local database owner was matched to `postgres` using the database ownership entry in the archive, so this also exercises the intended owner's schema privileges rather than relying on the bootstrap superuser.

All 62 original table COPY blocks, containing 1,747 rows, are compared privately using row fingerprints over their original columns before and after migration. Added columns are excluded from that preservation comparison. The original backup remains unchanged. The migration does not rewrite existing records or migration history.

`supabase/tests/paddle_restore_acceptance.sql` runs synthetic fixtures against the actual restored schema, roles, constraints, triggers, RPCs, and policies, then rolls back. Seven acceptance groups cover signup/uniqueness, accounts without profiles, ownership/RLS, Free limits, paid saves and quotas, required inserts and failure rollback, fulfillment/retries, provider ownership collisions, pause/resume/refunds, and one-time quota behavior. A failed event is retried successfully after its checkout is bound.

The local runner also uses separate concurrent database connections to test same-ticket save replay, competing saves against one quota, checkout creation, duplicate event processing, and distinct event IDs for the same payment. Exactly one entitlement/payment/checkout is created and consumed quota remains consumed. These fixtures use new synthetic account IDs and are removed in `finally`.

Application validation: 68 Vitest tests, 26 mocked catalog tests, and three preflight tests pass. Typecheck and production build pass. Lint has no errors and 72 existing warnings. Deno checks pass for checkout, webhook, customer portal, content analysis, document processing, and analytics functions. Build warnings about the existing `.env` NODE_ENV setting and empty vendor chunk remain; public build values were placeholders.

## Repeating local acceptance

Restore the protected archive into a compatible isolated engine, using the protected bootstrap procedure recorded with the backup; apply only the pending migration. Do not replay historical repository migrations. The runner neither restores the backup nor applies migrations, and refuses containers with networking or published ports:

```sh
FAQIFY_LOCAL_RESTORE_CONTAINER=faqify-migration-rehearsal-20261022 \
FAQIFY_LOCAL_TEST_OUTPUT=/Users/carbonface/Backups/faqify/dlzshcshqjdghmtzlbma/migration-rehearsal \
npm run test:restore
```

Private before/after preservation results, preflight output, SQL/error logs, and local target metadata are in that output folder. Never paste or upload raw database logs. The local database is stopped after verification; its Docker volume is retained.

## Remaining boundaries

There is no unresolved data decision for these three blockers. Nullable legacy owners are deliberately retained, and missing optional profiles are not repaired as a side effect of billing integration. Recheck the actual target schema and aggregate ownership state before a separately authorized rollout, because this rehearsal proves compatibility with the backup snapshot.

This is database/application verification, not a hosted Supabase Auth/API or real Paddle checkout test. Existing Razorpay reconciliation gaps and broader security-review items remain documented separately. A coordinated migration/function/frontend rollout is still required: the old browser save flow cannot run after direct FAQ insert privileges are revoked. No deployment or production migration is authorized by this rehearsal.
