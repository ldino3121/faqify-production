# FAQify code map

## Build root and source of truth

This folder is the complete app build root: package.json, src/main.tsx, Vite config, public assets and supabase/. The original ZIP had another outer folder with partial source copies and historical diagnostics; those are not build inputs. Build dependencies are installed from package-lock.json. src/config/plans.ts defines Free 5 / Pro 100 / Business 500 and USD 0 / 9 / 29.

## Account and shared state

App.tsx wraps route content in AuthProvider and SubscriptionProvider. useAuth.tsx owns Supabase session events. useSubscription.tsx owns one React Query subscription record and realtime channel per signed-in user; consumers share it. The server eligibility RPC is authoritative. src/lib/subscription.ts normalizes historical column names but never invents a paid expiry.

Dashboard.tsx mounts only the selected view, except FAQCreator which stays mounted after its first visit to preserve unfinished work. Overview includes subscription management. Razorpay legacy subscription controls remain for existing records; Paddle customers use the authenticated billing portal. Help links to Contact.

## Generation and storage

FAQCreator accepts URL, text or a document and a count from 1–10. Documents go through process-document with unpdf/Mammoth. analyze-content validates the user and quota, records a generation attempt, fetches public website content with redirect/IP checks when relevant, calls Gemini, validates the response and stores the generated FAQ array in faq_generation_requests. The client receives a generation ID plus preview content.

save_generated_faqs consumes that generation ID under a database transaction. It checks owner, ticket age, quota, paid status/expiry and Free collection cap. Collection insertion, individual FAQ insertion, usage increment and ticket consumption either commit together or roll back. Saving the same ticket twice does not create or charge twice. Direct client inserts and direct quota changes are disallowed.

Generation uses Gemini 2.5 Flash with Flash Lite fallback. No generic FAQ filler is added. A response with too few valid FAQ pairs is a retryable failure with no quota charge. Attempts are capped at 20/hour; saved FAQ pairs, not API requests, consume plan quota.

FAQManager reads collections with nested FAQs, edits/deletes existing owner rows, exports JSON/CSV/HTML and generates widgets. Ownership of an individual FAQ is through collection_id, not an independent faqs.user_id column.

## Embeds

config/widget.ts emits self-contained markup/script, with local text search and an accordion. get-faq-widget is public and returns only published collections and FAQs, ordered by order_index. It returns brandingRequired for Free owners and caches for five minutes. Existing embeds fetch the stored answers and are not live AI chat. Existing widgets remain available after generation eligibility expires. public/widget.js is a separate historical embed library; the connected Create/Manage paths use config/widget.ts.

## Paddle

BillingPlans is shared by public Pricing and PlanUpgrade. Legacy checkout components are lazy-loaded only when VITE_BILLING_PROVIDER=razorpay. Paddle SDK loads on demand, prices are selected server-side, and create-paddle-checkout binds the returned Paddle transaction ID to a server-created checkout intent. Pending transactions are reused; changing an unfinished checkout requires closing its unpaid draft/ready transaction at Paddle first.

paddle-webhook verifies the original raw body and timestamped HMAC, resolves configured prices, then calls service-only apply_paddle_event. The SQL transaction records processed event IDs, payment IDs, ownership and entitlement updates together. Only transaction.completed grants a period/quota. Lifecycle events change status and cancellation controls; they cannot independently extend paid access or refresh quota. Duplicate/stale deliveries do not refill a consumed quota. Full approved refunds/chargebacks of the current entitlement transaction revoke generation; partial refunds do not. Paddle customer portal sessions are created from the signed-in user's server-side customer mapping.

Paddle records are kept in paddle_checkouts, paddle_customers, paddle_events and paddle_payments, with Paddle metadata on user_subscriptions. Admin merges new Paddle payments with historical payment_transactions for display. Existing Razorpay recurring plans are not automatically migrated, and overlapping subscriptions are blocked. The code does not implement in-place plan swaps or prorated top-ups.

## Operations

send-contact persists support messages before best-effort Resend notifications. log-error captures frontend errors. track-analytics resolves logged-in ownership instead of trusting body.user_id, and permits public widget events only for published collections. Diagnostic/setup functions require an administrator. The dormant standalone Analytics and AdvancedEmbedGenerator components are preserved but are not wired into the dashboard.

Deployment prerequisites, exact secret names, staging tests and live boundaries are in PADDLE_SETUP.md. Local checks do not establish that the supplied snapshot matches every object currently deployed in Supabase.
