# Code review and implemented changes

Prepared 22 October 2026. This is a source-code update for the supplied FAQify project. It is not a claim that the live website, database, Paddle account or existing subscriptions were changed.

## Implemented

| Area | Finding | Change |
|---|---|---|
| Billing | No Paddle integration | Shared Paddle pricing UI, authenticated server-created checkout, verified webhook fulfillment and customer billing portal |
| Price trust | A browser must not choose the amount or paid entitlement | Server maps configured Paddle price IDs to the plan; signed payments must match the server-created intent or a bound recurring subscription |
| Webhook replay | Repeated deliveries must not refill quota | Event-ID and transaction-ID ledgers plus atomic SQL updates |
| Event ordering | Older payment/lifecycle events can arrive after replacement access | Timestamp guards and superseded subscription checks |
| Abandoned checkout | An old checkout can still be paid after a local timeout | Pending transaction reuse; user can explicitly cancel an unpaid draft/ready checkout at Paddle before opening a different one |
| Refunds | Payment reversal must not leave the current paid entitlement active indefinitely | Full approved refund/chargeback of the latest entitlement transaction blocks generation; partial refunds preserve access |
| Existing customers | A second recurring subscription can create overlapping charges | Existing recurring subscriptions block another checkout; legacy Razorpay management remains |
| Database access | Broad legacy subscription policy could expose other users' subscription rows; clients could write billing fields | Explicit account/admin reads, backend-only subscription/transaction writes and revoked legacy plan/usage mutation RPC permissions |
| FAQ persistence | Collection, FAQ rows and quota increment could succeed independently | Server-issued generation ticket and atomic save transaction; repeated saves charge once |
| Generation limits | Client checks and successful-save logs were insufficient for rate control | Authenticated server eligibility, fail-closed quota checks and serialized hourly attempt admission |
| Signup | No immediate session was incorrectly treated as an existing user | Sessionless signup follows email confirmation; immediate-session signup follows dashboard flow |
| Auth state | Listener captured initial state and could ignore later sign-in events | Subscribe before session retrieval; stale initial session cannot overwrite a newer event |
| Uploads | Selected FAQ count was dropped from the document request | Count is forwarded; requests support 1–10 pairs to use remaining credits |
| Documents | PDF/DOCX files were treated as raw printable bytes | Real PDF text extraction and DOCX decompression/XML text extraction; Unicode is preserved |
| AI quality | Missing answers could be filled with generic, unsupported FAQs | Validate returned pairs and fail without charging quota instead of fabricating filler |
| Website analysis | Public URL fetching lacked internal-address and redirect checks | Public-address/DNS checks on each redirect, request timeouts and a 2 MB readable-content cap |
| Exports | HTML interpolation and spreadsheet formulas could execute as active content | HTML escaping, CSV quoting and formula-prefix protection in connected export flows |
| Widgets | Untrusted content and invalid theme/collection values needed safer handling | Attribute escaping, supported-theme normalization, collection-ID validation; executable rendering test |
| Loading | Many useSubscription consumers opened duplicate reads/channels | One shared React Query subscription and realtime channel per user |
| Dashboard | All views mounted immediately and initialized billing while hidden | Mount views when selected; preserve the creator after first visit |
| Realtime | FAQManager rebuilt subscriptions whenever fetched collection data changed | Stable ownership-scoped listener lifecycle |
| Overview | PostgREST faqs(count) response was read as array length | Read the actual nested aggregate count |
| Billing return | Checkout success could appear to activate a plan before fulfillment | Show confirmation progress and poll the recorded transaction; URL callbacks never grant access |
| Status | Past-due state could still be labeled ACTIVE | Display recorded subscription status |
| Navigation | Help selected a tab with no implementation | Navigate to Contact |
| Razorpay lifecycle | Two handlers applied overlapping, different updates | Both URLs use one handler; source fields and pause/resume/halt handling consolidated; late activation cannot overwrite Paddle access |
| Diagnostics | Setup/debug handlers lacked an admin check | Require authenticated admin role before diagnostics or maintenance actions |
| Analytics | Caller-supplied user_id could misattribute events | Resolve authenticated ownership on the server; public events require a published collection |

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors and 72 warnings (dynamic `any` typing and React hook/refresh warnings remain; they have not been suppressed).
- `npm run build`: passed with non-secret placeholder public configuration. The build is not a checkout connectivity test.
- `npm test`: 64 tests passed across 9 files. Tests include an isolated PGlite/Postgres execution of the complete new migration, actual SQL save/fulfillment behavior, account isolation, replay/stale-event handling, refunds, recurring and one-time access, attempt rate limits, session transitions, real PDF/DOCX extraction, HTML/CSV safety and widget rendering/search.
- Deno 2.5.6 type checks: passed for create-paddle-checkout, paddle-webhook, paddle-customer-portal, analyze-content, process-document and track-analytics, including their imported shared code.
- Catalog setup script: Node syntax check passed; no catalog changes were executed.
- Source scan found no matching private Google/Stripe API-key or PEM private-key literals in runtime source/public assets. This is not an exhaustive secret audit. Actual environment files and historical diagnostic artifacts are excluded from the deliverable.

No real Gemini generation, email delivery, provider checkout, webhook delivery, production Supabase migration, or browser acceptance on the deployed site was performed. Those require configured services and staging acceptance.

## Remaining gaps and decisions

1. **Live setup is required.** Configure Paddle approval, exact approved domains, default payment link, product prices, scoped API key, client token, webhook destination/signing secret and payout information. See PADDLE_SETUP.md.
2. **Production rollout remains separate.** The pending migration has now passed actual-schema and concurrency tests on an isolated restore of the verified production backup; see [MIGRATION_REHEARSAL.md](MIGRATION_REHEARSAL.md). Historical migrations are not a clean bootstrap. Recheck target drift and coordinate the migration/functions/frontend rollout before any separately authorized production change.
3. **In-place plan changes/proration and top-ups are not implemented.** Current recurring subscribers must manage/cancel existing billing before another checkout. This prevents overlapping charges; it does not implement a prorated Pro-to-Business change. One-time purchases reset a fresh 30-day period instead of stacking unused time/credits.
4. **Razorpay fallback still needs provider-level regression testing.** Current recurring customers retain management, but no real Razorpay calls were made here. Historical one-time verification/capture paths still use separate fulfillment steps and should be consolidated into an atomic provider reconciliation routine before relying on the rollback UI for new sales. Default new checkout is Paddle.
5. **Terms need business review.** The existing strict no-refund page has not been silently rewritten. Align the published cancellation/refund disclosures and buyer terms with the actual Paddle selling arrangement before live checkout.
6. **Standalone analytics remains unfinished.** Its dashboard is not routed and the old get-analytics aggregates do not use the same event storage as the current tracker. The new pricing cards do not advertise that unfinished analytics dashboard. Public event limits are per function instance, not a distributed anti-fraud system.
7. **Scanned PDFs need OCR.** File text extraction supports readable PDFs/DOCX/TXT, with a 10 MB upload limit and 100-page PDF limit. Password-protected/scanned documents and compressed-document abuse need additional handling for a higher-risk public-upload workload.
8. **Website extraction still has limits.** JavaScript-only or blocked websites may require pasted content. DNS/redirect checks reduce internal-network fetching risk but do not replace provider-level egress controls against DNS rebinding. Consider an isolated fetch service or network allowlist before broad anonymous crawling.
9. **Refund edge cases require support.** Reversal of a chargeback and multiple partial refunds adding up to a full payment do not automatically restore/revoke access beyond the documented full-adjustment rule. Review them operationally.
10. **Existing embeds intentionally persist.** Expiry/refund blocks new generation, not already-published FAQ widgets. Free's single-collection cap means a Free customer must delete the existing collection or upgrade to create another; deleting content does not refund used quota.
11. **Frontend type debt remains.** Generated Supabase types lag parts of the live/historical schema, so several dynamic boundary casts remain. Regenerate types from the confirmed staging schema, then tighten the types in a separate focused pass. Installed dependency age and the build's Browserslist warning also warrant a separate compatibility/security update.

The source map in ARCHITECTURE.md is the baseline for further work on this version.
