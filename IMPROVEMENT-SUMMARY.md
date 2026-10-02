# 📊 FAQify — Improvement Summary

> Covers all code changes made during the audit + remediation effort.
> **No secrets were added; no source was left broken.** Build & tests are green.

---

## 1. Status at a glance

| Check | Result |
|---|---|
| Production build (`vite build`) | ✅ Passes (1864 modules, ~1.9s) |
| Unit tests (`vitest`) | ✅ 18/18 pass |
| Type-check on new/edited files | ✅ 0 errors |
| Hard-coded `faqify.app` in code | ✅ 0 remaining |
| Hard-coded Supabase key in `src/` | ✅ 0 remaining |
| New DB migrations | 6 |
| New edge function | 1 (`admin-set-plan`) |
| New frontend modules | `env.ts`, `plans.ts`, `analytics.ts`, `Seo.tsx`, `AdminRoute.tsx`, `Admin.tsx` |

---

## 2. ✅ Improvements made (what changed & why)

### 🔴 P0 — Critical fixes

**P0-1 · Domain centralization (fixes the expired `faqify.app` risk)**
- Created `src/config/env.ts` → single env-driven `PUBLIC_APP_URL` / `PUBLIC_SUPABASE_URL`.
- `src/config/widget.ts` no longer hard-codes `faqify.app`; embed codes now use the configured URL.
- `supabase/config.toml` auth redirect URLs: removed dead `faqify.app` entries.
- `analyze-content` bot `User-Agent` / `From` header is now env-driven (`PUBLIC_APP_URL`).
- **Before:** 20+ hard-coded `faqify.app` references. **After:** 0 in runtime code.
- Falls back to current origin so the app still works before you buy a domain.

**P0-2 · Pricing reconciliation (billing integrity)**
- Created `src/config/plans.ts` → **single source of truth** (Free 5 / Pro 100 / Business 500, $0/$9/$29).
- `Pricing.tsx` and `PlanUpgradeData.tsx` now both consume `PLANS`.
- **Before:** landing page said Free **10**, dashboard said **5**, migrations said 10/1000/3000. **After:** all aligned.
- Migration `20250120000000_canonical_pricing.sql` aligns DB + signup default.

**P0-3 · Protected the expensive AI function**
- `analyze-content` → `verify_jwt = true` **plus** in-function auth (401) and quota check via `can_generate_faqs` (429).
- **Before:** anyone could call it anonymously and burn your Gemini quota. **After:** authenticated + quota-enforced.

**P0-4 · Enabled email confirmations**
- `enable_confirmations = true` + `SignUp.tsx` now shows a "Confirm your email" state/toast.
- **Before:** anyone could farm free accounts. **After:** must verify email.

**P0-5 · Build + CI + tests**
- Fixed broken build (missing `@rollup/rollup-darwin-arm64` via `npm install`).
- Added `typecheck` / `test` / `ci` scripts + `.github/workflows/ci.yml`.
- Added Vitest + 18 unit tests (validation, pricing consistency, embed generation).
- CI gates on **build + tests**; type/lint are informational (pre-existing debt).

**P0-6 · Removed hard-coded credentials**
- `client.ts` now **fails fast** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing.
- Embed API base is env-driven instead of a literal Supabase URL.

---

### 🟠 P1 — High-value fixes

**P1-7 · Razorpay plan-id mismatch**
- Created `razorpay_plan_id_usd` column + seeded the two USD plan IDs (code referenced a column that never existed).

**P1-8 · Payment idempotency (stops double-charging)**
- Unique indexes on `razorpay_payment_id` / `razorpay_subscription_id`.
- `verify-razorpay-payment` early-returns if already processed.
- `razorpay-webhook` ignores duplicate `subscription.charged` / `subscription.activated`.
- History now records the **real** previous plan (was hard-coded `'Free'`).

**P1-9 · SEO foundation**
- `public/sitemap.xml` + `public/robots.txt` Sitemap line.
- `Seo.tsx` component (title/description/canonical/JSON-LD) — added to landing.
- `SoftwareApplication` JSON-LD in `index.html`.
- Strategy note: **do not sell "FAQ schema/SEO"** — Google removed FAQ rich results (May 2026).

**P1-10 · Funnel analytics**
- `src/utils/analytics.ts` (event taxonomy, session ID, first-touch attribution).
- Attribution captured on app load; `analytics_columns` migration.

**P1-11 · Admin / support panel**
- `user_roles` table + `is_admin()` + admin RLS policies.
- `/admin` route (admin-only) with **Users / Transactions / Funnel** tabs + plan-change action.
- `admin-set-plan` edge function (auth + admin check + audit trail).

**P1-12 · Widget feature gaps**
- Rewrote the embed runtime: **client-side search**, **accordion/list/columns layouts**, **accessible `<button>` + `aria-expanded/aria-controls`**, server-authoritative branding.

**P1-13 · Free-plan abuse**
- Branding gate: Free embeds always show "Powered by FAQify" (enforced in `get-faq-widget`).
- Per-user hourly rate limit (20/hr) in `analyze-content`.
- DB trigger caps Free tier to **1 collection**.

**P1-14 · Theming**
- `next-themes` provider + **light/dark toggle** in dashboard header.
- `Dashboard.tsx` moved from hard-coded `bg-black text-white` → design tokens.

---

## 3. 🟡 What was optimized (efficiency / cost / quality)
- **AI cost:** server-side quota enforcement prevents wasted/unlimited Gemini calls.
- **Cost protection:** auth + rate-limit on the paid AI path.
- **Billing correctness:** one pricing source of truth + idempotent payment processing.
- **Security:** no secrets in `src/`, fail-fast config, email verification, RLS for admin data.
- **Deploy safety:** build is reproducible; CI blocks broken builds/tests.
- **Widget:** searchable + accessible + layouts → better conversion & a11y score.

---

## 4. 🔴 What is LEFT (not yet done)

### Blocking / security (do these before launch)
1. **Rotating committed secrets** — `.env` is in git with real `service_role`, Gemini, Razorpay keys.
2. **Applying the 6 migrations** — they are NOT auto-applied.
3. **Deploying the edge functions** — code changes are not live until deployed.
4. **Enabling "Confirm email" in Supabase dashboard** — `config.toml` only affects local dev.
5. **Domain** — not purchased yet; `public/sitemap.xml`, `public/robots.txt`, `index.html` og:image/canonical still use `YOUR-DOMAIN.example` placeholders.

### Product work (deferred, ranked by value)
| # | Item | Why it matters |
|---|---|---|
| 1 | **AI answer agent (RAG)** | Biggest revenue lever → enables $29–99/mo tier |
| 2 | **CAPTCHA on signup** (hCaptcha/Turnstile) | Needs your site keys |
| 3 | **`AdvancedEmbedGenerator` search/layout toggles** | Widget *supports* them; the UI doesn't expose them yet |
| 4 | **`<Seo>` on remaining pages** | Only landing page uses it now |
| 5 | **Gemini retry / fallback model** | Resilience if `gemini-2.5-flash` fails |
| 6 | **Real PDF/DOCX parsing** | Upload quality is byte-decode (crude) |
| 7 | **Headless scraping** | Current regex scraping fails on JS-heavy sites |
| 8 | **Dunning / invoices / billing portal** | Renewal recovery + GST invoicing |
| 9 | **Multi-language + auto-re-sync from source** | Premium add-ons |
| 10 | **GDPR/cookie consent** | Compliance |
| 11 | **Pre-existing type/lint debt** | ~dozens of old errors (CI treats as informational) |
| 12 | **Admin nav link in header** | `/admin` works but isn't linked anywhere |

---

## 5. 🧪 What you must check MANUALLY

### A. Build & test (local)
```bash
cd faqify-ai-spark-main
npm install
npm test          # expect 18 passed
npm run build     # expect dist/ produced
```
- [ ] All three commands succeed.
- [ ] Push → GitHub Actions CI is green.

### B. Security
- [ ] **Rotate:** `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Move server secrets to `.env.local` (gitignored); commit a **public-only** `.env` with just the `VITE_` values so CI still builds.
- [ ] Verify `.env` no longer contains service-role/Gemini/Razorpay secrets after rotation.

### C. Database
- [ ] Apply all 6 migrations (`npx supabase db push` **or** run the SQL files in date order).
- [ ] `SELECT name, faq_limit FROM subscription_plans;` → **5 / 100 / 500**.
- [ ] Insert your admin row into `user_roles`.
- [ ] Confirm the `razorpay_plan_id_usd` values match your Razorpay dashboard.

### D. Edge functions
- [ ] Deploy: `analyze-content`, `get-faq-widget`, `verify-razorpay-payment`, `razorpay-webhook`, `admin-set-plan`.
- [ ] `npx supabase secrets set` → `GEMINI_API_KEY`, `RAZORPAY_*`, `PUBLIC_APP_URL`.
- [ ] `curl -X POST https://<domain>/functions/v1/analyze-content` with **no auth** → expect **401**.
- [ ] `get-faq-widget` still public (should return published FAQs + `brandingRequired`).

### E. Supabase dashboard
- [ ] Auth → Email → **Confirm email = ON**.
- [ ] Auth → URL Configuration → Site URL + redirect URLs updated (with domain).

### F. Payments (test mode first)
- [ ] New signup → confirmation email → dashboard.
- [ ] Upgrade on Razorpay test mode → plan activates → usage limit changes.
- [ ] **Replay the webhook** → confirm only ONE activation (no double).
- [ ] Downgrade/cancel webhook → correct status.

### G. Product smoke test
- [ ] Generate 3–10 FAQs → saved → Manage tab shows them.
- [ ] Landing shows **Free 5 / Pro $9 / Business $29**; dashboard matches.
- [ ] Copy embed → paste into a test HTML page:
  - [ ] Search box filters questions
  - [ ] Accordion opens/closes by keyboard (Tab + Enter)
  - [ ] Free-tier embed shows **"Powered by FAQify"**
- [ ] Try creating a **2nd Free collection** → blocked with upgrade message.
- [ ] `/admin` loads for you; a normal user is redirected away.
- [ ] Light/dark toggle works in the dashboard.

### H. When you buy the domain (then tell me)
- [ ] Add domain in Vercel + update DNS.
- [ ] Set `VITE_PUBLIC_APP_URL` (Vercel) + `PUBLIC_APP_URL` (edge secrets).
- [ ] Replace `YOUR-DOMAIN.example` in `sitemap.xml` + `robots.txt`.
- [ ] Make `og:image` absolute + add canonical in `index.html`.
- [ ] Update Supabase Auth redirect URLs + Google OAuth redirect URIs.

---

## 6. 📁 File inventory

**New:** `src/config/env.ts`, `src/config/plans.ts`, `src/utils/analytics.ts`, `src/components/SeoRoute.tsx`, `src/components/AdminRoute.tsx`, `src/pages/Admin.tsx`, `vitest.config.ts`, 3 test files, `public/sitemap.xml`, `.github/workflows/ci.yml`, 6 migrations, `supabase/functions/admin-set-plan/`.

**Modified:** `App.tsx`, `Dashboard.tsx`, `DashboardHeader.tsx`, `Index.tsx`, `Pricing.tsx`, `PlanUpgradeData.tsx`, `SignUp.tsx`, `Hero.tsx`, `Features.tsx`, `FAQCreator.tsx`, `FAQManager.tsx`, `AdvancedEmbedGenerator.tsx`, `client.ts`, `widget.ts`, `config.toml`, `index.html`, `vite.config.ts`, `robots.txt`, `package.json`, `analyze-content`, `get-faq-widget`, `razorpay-webhook`, `verify-razorpay-payment`.

**Docs:** `REMEDIATION-SPEC.md` (file-by-file plan), this file.

---

## 7. 🆕 Latest additions (this session)

**Quick wins (all done):**
1. **`AdvancedEmbedGenerator` search/layout toggles** — `EmbedConfig` now has `search: boolean` + `layout: 'accordion' | 'list' | 'columns'`; passed through to `generateEmbedCode` in `basic`, `advanced`, `wordpress` cases; UI has a Search checkbox + Layout select; `FAQManager` and `FAQCreator` quick-embed now default to `search: true`; hard-coded Supabase URL removed from the React snippet.
2. **`<Seo>` on remaining pages** — implemented as a single `SeoRoute` component (mounted once in `App.tsx`) that sets title/description/canonical/OG per route; `Seo.tsx` removed as redundant.
3. **Admin link in header** — `DashboardHeader` shows an `Admin` button (Shield icon) only when `is_admin()` returns true.

**Critical bug found & fixed — landing-page payment flow was broken:**
- `Pricing.tsx` called `createAndOpenSubscription(...)` but never destructured it from `useRazorpaySubscription` — the default auto-renew path threw a `ReferenceError`, so **no landing-page Pro/Business upgrade could ever complete**.
- Fixed by calling the hook, awaiting the subscription creation, wiring `processingPlan`, and adding `upgrade_clicked` + `payment_success` funnel events.

**Funnel events now actually fire (were defined but never called):**
- `generation_success` / `generation_failed` / `collection_saved` / `embed_copied` in `FAQCreator`; `signup` (+UTM) in `SignUp.tsx`; `upgrade_clicked` / `payment_success` in `Pricing.tsx`.

**Performance (audit: SPA distribution):**
- **Route-level code splitting**: main bundle **526 kB → 315 kB** (~91 kB gzip); `>500 kB` chunk warning gone; Dashboard/Demo/legal pages lazy-load on demand (landing stays eager).

**AI resilience (replaces remaining "single model" gap):**
- `analyze-content` now retries (2×) on 429/5xx/network errors and falls back from `gemini-2.5-flash` to `gemini-2.5-flash-lite`; error contract (HTTP 200 + error flag) preserved for the Supabase SDK.

**SEO remaining item resolved:**
- `og:image`/`twitter:image` now absolute via build-time `%APP_URL%` token (from `APP_URL` or `VITE_PUBLIC_APP_URL`; falls back to relative path when unset). Verified: with `APP_URL` set → absolute URL; without → `/faqify-og-image.png`.

## 8. 🔌 Supabase live connection — completed via CLI

**Project:** `dlzshcshqjdghmtzlbma` (FAQify, South Asia/Mumbai) — linked with the provided access token.

**Migrations applied to the live DB (verified):**
- **Canonical pricing** → `subscription_plans` now **Free 5 / Pro 100 / Business 500** ✅
- `razorpay_plan_id_usd` present (Pro `plan_Rk4UC2Kxsh78K9`, Business `plan_Rk4Uu6Syvg6cZH`) ✅
- Idempotency indexes: `ux_payment_tx_payment_id`, `ux_payment_tx_subscription_id`, `ux_user_sub_razorpay_sub` ✅
- `user_roles` + `is_admin()` + admin RLS ✅
- `enforce_free_collection_limit` trigger ✅
- `usage_analytics` columns (`action`, `created_at`) ✅
- **`20250126000000_schema_alignment.sql` (NEW — discovered during connection):** the live DB was **missing many columns the payment functions write to**. Added to `user_subscriptions`: `plan_tier`, `payment_gateway`, `razorpay_order_id`, `currency`, `plan_changed_at`, `payment_type`, `billing_cycle`, `subscription_source`, `next_billing_date`, `cancelled_at`, `cancellation_reason`; added to `payment_transactions`: `payment_gateway`, `transaction_type`, `gateway_response`, `completed_at`, `failed_at`, `subscription_id`, `failure_reason`. Backfilled `plan_tier` ← `plan_id` and `payment_gateway` ← `gateway`. **This unblocks the deployed payment functions.**

**Edge functions deployed (verified ACTIVE):** `analyze-content` (v41), `get-faq-widget` (v13), `verify-razorpay-payment` (v4), `razorpay-webhook` (v4), `admin-set-plan` (v1).

**Admins granted:** `carbonface99@gmail.com`, `carbonface9999@yahoo.com` (remove one later if desired).

**Live smoke tests:** `analyze-content` unauthenticated → **HTTP 401** ✅ (JWT enforced); `get-faq-widget` without id → 400 ✅; `is_admin` RPC reachable ✅.

**Migration history reconciled** (6 new + alignment marked applied; phantom `20250101000000` baseline repaired) so future `supabase db push` is clean.

⚠️ **Do NOT run `supabase db push` blindly** — 9 historical migrations are still unrecorded locally and would replay old pricing (10/1000/3000). Apply new migrations with `supabase db query --linked -f <file>`.

---

*Summary generated as part of the FAQify audit. See `REMEDIATION-SPEC.md` for full technical detail.*

