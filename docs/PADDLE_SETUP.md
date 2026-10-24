> Target decision for this branch: the owner selected the existing production Supabase project for Paddle sandbox testing. See [SUPABASE_PREFLIGHT_AND_BACKUP.md](SUPABASE_PREFLIGHT_AND_BACKUP.md) for metadata preflight, confirmed-project requirements and backup/restore preparation. The original staging recommendation below is retained as background, not a request to reconfirm that decision. No migration or deployment is authorized by this preparation step.

# FAQify Paddle integration: setup and acceptance

The exported production schema and a local restore have now been rehearsed; see [MIGRATION_REHEARSAL.md](MIGRATION_REHEARSAL.md) for the corrected migration, actual-schema acceptance tests, aggregate findings, and remaining rollout boundaries. All database changes in that rehearsal were isolated locally.

This project contains the integration code. No account settings, catalog items, database changes, secret updates, deployments or real payments were performed by this coding task.

## 1. Test in isolation

Use a separate Supabase staging project with a copy of your current schema and test users, and a Paddle sandbox account. Do not point Paddle sandbox at your production user database: sandbox payments intentionally grant test access in the configured database.

The supplied project is for an existing FAQify schema. Historical migrations are not a clean bootstrap: several refer to objects created by manual SQL, and their filename dates do not establish the order they were deployed. Do not run `supabase db reset` or replay all old migrations against an existing database.

Back up the database and inspect the new migration before applying it. Apply only `supabase/migrations/20261022000000_paddle_and_atomic_faq_saves.sql` to the existing staging schema. It is a versioned migration to apply once. It creates Paddle tables, signed generation tickets, atomic save RPCs, stricter account permissions and billing rules. It requires the existing profiles, subscriptions, collections, FAQs, analytics and role tables/functions. Check `is_admin()` and existing RLS ownership policies before rollout. The main source snapshot expects `plan_id`, `plan_tier`, last-reset and plan-date fields; the new migration adds `plan_id` when absent.

This migration and the new generation function/frontend must ship together: the old frontend directly inserts collections and increments quota, which the migration deliberately disallows. Stage a maintenance window or coordinated deployment to avoid old browser tabs using that flow.

## 2. Configure the Paddle catalog

Use the Paddle Billing catalog, not Paddle Classic. Create:

| Product | Price | Recurrence | Grant |
|---|---|---|---|
| FAQify Pro | USD 9 | Every month | 100 FAQ pairs each paid period |
| FAQify Business | USD 29 | Every month | 500 FAQ pairs each paid period |
| FAQify Pro | USD 9 | One-time, no billing cycle | 100 FAQ pairs / 30 days |
| FAQify Business | USD 29 | One-time, no billing cycle | 500 FAQ pairs / 30 days |

Prices exclude applicable tax; checkout shows final tax. No free trials or discounts are configured by this code. Free remains an application plan, not a Paddle product. If you do not want one-time purchases, set `VITE_PADDLE_ENABLE_ONETIME=false` and omit their IDs.

Optional sandbox catalog inspection: set `PADDLE_ENVIRONMENT=sandbox` and `PADDLE_SANDBOX_API_KEY` (or `PADDLE_API_KEY`) in your shell, then run `node scripts/setup-paddle.mjs`. It is read-only by default, recognizes the existing FAQify catalog without requiring custom metadata, validates both tiers before any write, and stops on conflicts or ambiguity. Existing price IDs are printed; missing entries are reported. Only an explicit `--apply` creates missing entries and requires product/price write permissions. This script refuses live environments and credentials. No catalog command was executed during the security review; tests mock every request. Use the existing four sandbox price IDs rather than provisioning again.

Check Paddle product tax classification against your actual product. The script selects SaaS. Approve your checkout domain(s) and set the default payment link to `https://www.faqify.app/checkout` in live, or your staging domain `/checkout` in sandbox. That public route supports Paddle's `_ptxn` transaction link, including payment-method update links.

## 3. Set environment variables

Copy `.env.example` to `.env.local`. Reuse your existing public Supabase URL/key. Add the sandbox Paddle client-side token (safe for browser use). The frontend environment must match the backend environment.

Set the variables in `supabase/paddle-secrets.example` in Supabase Edge Function secrets. API keys and webhook secrets belong ONLY on the backend. The runtime API key needs transactions read/write and customer portal sessions write. Preserve existing Gemini, Resend and Razorpay secrets. No actual secret is included in this package.

## 4. Deploy functions

Deploy the new `create-paddle-checkout`, `paddle-webhook` and `paddle-customer-portal` functions. The Paddle webhook has `verify_jwt=false`; it authenticates the original request bytes using `Paddle-Signature` and its notification destination secret. Authenticated endpoints verify the user explicitly as well.

Also deploy the changed `analyze-content`, `process-document`, `track-analytics`, `manage-razorpay-subscription`, `create-razorpay-subscription`, `verify-razorpay-payment`, `razorpay-webhook`, `razorpay-subscription-webhook` and restricted diagnostic functions. Include their `_shared` imports. Deploy both historical Razorpay webhook URLs: both now run the same handler.

JWT verification settings depend on your Supabase signing-key configuration. If gateway verification rejects valid user sessions, follow Supabase's current signing-key guidance; explicit user validation must remain enabled in the code. Never disable signature validation on provider webhooks.

## 5. Create the notification destination

Destination: `https://YOUR-PROJECT.supabase.co/functions/v1/paddle-webhook`.

Subscribe to:
- `transaction.completed`
- `subscription.created`, `subscription.activated`, `subscription.updated`
- `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.past_due`
- `adjustment.created`, `adjustment.updated`

Copy this destination's signing secret to `PADDLE_WEBHOOK_SECRET`. Grant access only from completed transactions. Checkout callbacks display progress and refresh the account; they cannot activate a paid plan.

Delivery is at least once and may arrive out of order. SQL deduplicates event IDs and transaction IDs, and timestamps prevent stale payments/lifecycle notifications from overwriting newer access. A lifecycle event arriving before payment ownership is established returns 500 for retry. Inspect failed deliveries and use Paddle redelivery after fixing configuration. The server allows five minutes of signature timestamp skew; keep server time accurate.

## 6. Run acceptance tests

Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Local database tests use an isolated PGlite Postgres engine, not your live Supabase database. Do not run the old `sim` scripts against production; they create/delete users and write billing rows.

Then test in the staging browser with Paddle sandbox test cards:
1. Email signup with confirmation, Google login, password recovery, logout.
2. Text, website and real PDF/DOCX/TXT input; choose 1, 3, 5 and 10 FAQ pairs as quota allows.
3. Save/retry the same generation: one collection and one quota charge. Failed save must leave neither partial content nor a quota charge.
4. Edit, delete, export and embed; confirm updates on an external test page after up to five minutes of cache.
5. Buy Pro and Business, separately with recurring and one-time prices. Confirm webhook access, usage limit, source, expiry and billing portal/invoice access.
6. Close checkout without paying: no paid access. Reopen an existing pending checkout: no second transaction should be created. To change an abandoned checkout, use “Close an unfinished checkout”; the server cancels only draft/ready transactions at Paddle before releasing the intent.
7. Deliver duplicate payment events: consumed quota must remain consumed.
8. Renewal: new paid period and fresh quota. Scheduled cancellation: access until paid end; effective cancellation/pause: generation blocked. Resume: remaining already-paid period only.
9. Failed renewal / past due: generation blocked until payment is completed. Existing published widgets remain available.
10. Full approved refund of the current entitlement transaction: generation blocked. Partial refunds preserve access. Later payment grants its own new period.
11. Confirm legacy Razorpay users can manage their subscription and cannot start an overlapping Paddle purchase. This is not an automatic subscription migration.
12. Review Paddle notification failures, Supabase logs and customer-facing terms before enabling live sales.

## 7. Go live

Complete Paddle's domain/account approval and payout setup. Recreate catalog in live (IDs and credentials differ), create the live notification destination, and use its own signing secret. Change both frontend and backend environments to live. Confirm the exact domains that open checkout are approved. Deploy the tested build and coordinated database/functions changes, then perform your approved live acceptance transaction.

`VITE_BILLING_PROVIDER=razorpay` retains the legacy new-checkout UI as an explicit rollback setting. It does not reverse the database migration. Keep backend fixes deployed and do not restore permissive subscription grants. Existing Razorpay subscriptions are managed according to their recorded provider even when new checkout uses Paddle.

## Supported behavior and remaining boundaries

- No automatic migration or silent cancellation of existing Razorpay recurring subscriptions.
- An active/past-due/paused recurring subscription blocks a second checkout. In-place plan swaps/proration and paid quota top-ups are not implemented. Manage/cancel existing billing first; a scheduled cancellation still holds the subscription until effective end.
- A one-time purchase starts a fresh 30-day period and resets its plan quota; it does not stack unused time or credits, matching the prior product rule.
- A full refund or chargeback revokes generation for the latest entitlement transaction. Partial refunds do not. Chargeback reversals and multiple partial refunds totaling a full payment require support review; no automatic restoration is assumed.
- Existing published widgets continue to work after paid generation access ends. Free has one collection and required branding. Deleting content does not refund consumed quota.
- PDF/DOCX extraction is real text extraction; scanned PDFs need OCR and PDFs over 100 pages are rejected.
- Old dormant analytics dashboard components remain disconnected. Advertised analytics have been removed from the new pricing cards until that feature is integrated end to end.
- Review cancellation/refund terms with your business adviser against Paddle's buyer terms before launch. This task does not silently change your no-refund business policy.

Official integration references:
- https://developer.paddle.com/api-reference/transactions/create-transaction
- https://developer.paddle.com/webhooks/about/signature-verification
- https://developer.paddle.com/webhooks/transactions/transaction-completed
- https://developer.paddle.com/build/customers/integrate-customer-portal
- https://developer.paddle.com/build/go-live-checklist
