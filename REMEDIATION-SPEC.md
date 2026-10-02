# FAQify — Technical Remediation Specification (P0 / P1)

> **Status:** Specification only. **No application code has been changed.**
> **Author:** Engineering audit
> **Scope:** All P0 (critical) and P1 (high) issues identified in the FAQify audit.

---

## 0. Meta

### 0.1 Project root (authoritative)
All paths below are **relative to**:
```
/Users/carbonface/Downloads/faqify-ai-spark-main/faqify-ai-spark-main/
```
> ⚠️ The parent directory (`.../Downloads/faqify-ai-spark-main/`) contains a **stale, partial `src/`** (only `pages/Dashboard.tsx`, `pages/Login.tsx`, `components/dashboard/FAQCreator.tsx`) that differs from the real source. All changes target the **inner** project root only. Recommend deleting the stale parent `src/` to prevent version drift.

### 0.2 Conventions used in this document
- `CURRENT` = exact code/state today (with file + line reference).
- `TARGET` = proposed replacement.
- `MIGRATION` = SQL changes (new migration files only; never edit already-applied migrations).
- `VERIFY` = acceptance check.
- `EFFORT` = engineering estimate (S ≤ 2h, M ≤ 1d, L ≤ 3d).

### 0.3 Issue summary
| ID | Sev | Title | Primary files | Effort |
|----|-----|-------|---------------|--------|
| P0-1 | 🔴 | Domain centralization / dead `faqify.app` | `src/config/widget.ts`, `supabase/config.toml`, `supabase/functions/analyze-content/index.ts`, `index.html`, `.env*` | M |
| P0-2 | 🔴 | Pricing / FAQ-limit reconciliation | `src/components/sections/Pricing.tsx`, `src/components/dashboard/PlanUpgradeData.tsx`, `supabase/migrations/*`, new `src/config/plans.ts` | M |
| P0-3 | 🔴 | `analyze-content` public (`verify_jwt=false`) | `supabase/config.toml`, `supabase/functions/analyze-content/index.ts` | M |
| P0-4 | 🔴 | Email confirmations disabled | `supabase/config.toml` | S |
| P0-5 | 🔴 | Build broken + no CI/tests | `package.json`, new `.github/workflows/ci.yml` | M |
| P0-6 | 🔴 | Hard-coded Supabase URL/key fallbacks | `src/integrations/supabase/client.ts`, `src/config/widget.ts`, `public/widget.js` | S |
| P1-7 | 🟠 | Razorpay plan-id column mismatch | `supabase/functions/create-razorpay-subscription/index.ts`, `supabase/migrations/*` | S |
| P1-8 | 🟠 | Payment idempotency / race / hard-coded "from Free" | `supabase/functions/verify-razorpay-payment/index.ts`, `supabase/functions/razorpay-webhook/index.ts` | M |
| P1-9 | 🟠 | SEO foundation missing (sitemap, meta, JSON-LD) | `public/robots.txt`, new `public/sitemap.xml`, `index.html`, new `src/components/Seo.tsx` | M |
| P1-10 | 🟠 | No funnel / activation / revenue analytics | `supabase/functions/track-analytics/index.ts`, `src/**`, new admin views | M |
| P1-11 | 🟠 | No admin / support panel | new `supabase/functions/admin-*/`, new `src/pages/Admin.tsx` | L |
| P1-12 | 🟠 | Widget feature gaps (search, categories, layouts, a11y) | `src/config/widget.ts`, `public/widget.js`, `src/components/dashboard/AdvancedEmbedGenerator.tsx` | L |
| P1-13 | 🟠 | Free-plan abuse surface | `supabase/config.toml`, `supabase/functions/analyze-content/index.ts`, widget config | M |
| P1-14 | 🟠 | Dark-only hard-coded theming | `src/pages/Dashboard.tsx`, `src/App.tsx`, many components | M |

### 0.4 Recommended execution order
`P0-8 → P0-1 → P0-2 → P0-3 → P0-4 → P0-6 → P0-5 → P1-7 → P1-9 → P1-13 → P1-10 → P1-14 → P1-12 → P1-11`
(Do **P1-8 first** because it prevents double-charging while the other work lands.)

---
## P0-1 — Domain centralization / dead `faqify.app`

**Problem:** `faqify.app` (expired) is hard-coded in multiple places. New embeds, OAuth redirects and login depend on it. Existing **inline** embeds are self-contained (they call the Supabase project directly) so they survive, but anything loading a script from the domain, plus the app itself, breaks.

**Files & current state**
- `src/config/widget.ts`
  - L4 `PRODUCTION_DOMAIN: 'https://faqify.app',`
  - L7-11 `DOMAINS: { development, staging: 'https://staging-faqify.app', production: 'https://faqify.app' }`
  - L14-18 `FALLBACK_DOMAINS: ['https://faqify.app', 'https://www.faqify.app', 'https://faqify-production.vercel.app']`
  - L21-46 `getWidgetDomain()` returns `PRODUCTION_DOMAIN` in dev/staging.
- `supabase/config.toml` L47-48 auth redirect URLs `https://faqify.app/dashboard`, `https://faqify.app/`.
- `supabase/functions/analyze-content/index.ts` L227 UA `FAQify-Bot/1.0 (+https://faqify.app/bot)`, L229 `'From': 'bot@faqify.app'`.
- `index.html` L18 `og:image` is a **relative** path `/faqify-og-image.png` (must be absolute for social crawlers).
- `.env`, `.env.example`, `.env.production`, `.env.production.template` — no `VITE_PUBLIC_APP_URL` yet.
- `public/widget.js` L36 `BULLETPROOF_API_URL = 'https://dlzshcshqjdghmtzlbma.supabase.co'` (correct — leave; this is the API, not the app domain).

**TARGET**
1. Add a single env var `VITE_PUBLIC_APP_URL` (and `PUBLIC_APP_URL` for edge functions). Replace every hard-coded site domain with it.
2. `src/config/widget.ts`:
```ts
const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string) || 'https://REPLACE_ME.example';

export const WIDGET_CONFIG = {
  PRODUCTION_DOMAIN: APP_URL,
  DOMAINS: {
    development: typeof window !== 'undefined' ? window.location.origin : APP_URL,
    staging: APP_URL,
    production: APP_URL,
  },
  FALLBACK_DOMAINS: [APP_URL],
  getWidgetDomain(): string {
    // Always emit the stable public app URL in embed codes so embeds work on external sites
    return APP_URL;
  },
  // ...generateEmbedCode / getThemeStyles unchanged
};
```
3. `supabase/config.toml` (or Supabase dashboard → Auth → URL config):
```toml
[auth]
site_url = "https://REPLACE_ME.example"
additional_redirect_urls = [
  "https://REPLACE_ME.example/dashboard",
  "https://REPLACE_ME.example/",
  "https://REPLACE_ME.example/reset-password",
  "http://localhost:8082/dashboard",
  "http://localhost:8082/",
]
```
4. `analyze-content/index.ts` L227/L229:
```ts
'User-Agent': 'FAQify-Bot/1.0 (+https://REPLACE_ME.example/bot)',
'From': `bot@${new URL(Deno.env.get('PUBLIC_APP_URL') ?? 'https://REPLACE_ME.example').hostname}`,
```
   (or simply read `PUBLIC_APP_URL` and derive host).
5. `index.html`: make `og:image`/`twitter:image` absolute:
```html
<meta property="og:image" content="https://REPLACE_ME.example/faqify-og-image.png" />
```
   Add `<link rel="canonical" href="https://REPLACE_ME.example/" />`.

**Ops (domain migration)**
- Point the new domain at Vercel (Project → Domains), keep `vercel.json` rewrites.
- If keeping `faqify.app` recoverable: add a **permanent redirect** (`faqify.app/*` → new domain) so any previously-issued CDN embeds keep working.
- Update Supabase Auth redirect allow-list, Google OAuth authorized redirect URIs (`https://<ref>.supabase.co/auth/v1/callback` and app domain), and Razorpay webhook URL.

**VERIFY**
- `grep -rn 'faqify.app' src supabase/functions index.html` returns only comments/none.
- Generate an embed code on localhost → snippet contains the new `VITE_PUBLIC_APP_URL`.
- Google login + email login redirect to the new domain.

---
## P0-2 — Pricing / FAQ-limit reconciliation

**Problem:** FAQ limits are inconsistent between the UI and the database history, creating billing/trust risk.

**Evidence (all currently disagree)**
| Source | Free | Pro | Business |
|---|---|---|---|
| `src/components/sections/Pricing.tsx` L90 | **10** | 100 | 500 |
| `src/components/dashboard/PlanUpgradeData.tsx` L88/112 | **5** | 100 | 500 |
| `PRICING_SYSTEM.md` | **5** | 100 | 500 |
| `supabase/migrations/20250106000000_update_pricing_plans.sql` | 10 | **1000** | **3000** |
| `supabase/migrations/20250107000000_update_pricing_to_new_structure.sql` | 5 | 100 | 500 |
| `supabase/migrations/20250913090000_full_db_fix.sql` L95 (signup default) | COALESCE(...,**10**) | — | — |

**Decide canonical** (recommend **Free 5 / Pro 100 / Business 500**, matching `PRICING_SYSTEM.md` + `PlanUpgradeData.tsx`). Prices stay **Free $0 / Pro $9 / Business $29 (monthly, USD cents 0 / 900 / 2900)**.

**TARGET**
1. Create `src/config/plans.ts` — the single frontend source of truth:
```ts
export type PlanTier = 'Free' | 'Pro' | 'Business';
export interface PlanDef { tier: PlanTier; name: string; priceMonthlyCents: number; faqLimit: number; features: string[]; }
export const PLANS: PlanDef[] = [
  { tier: 'Free',     name: 'Free',     priceMonthlyCents: 0,    faqLimit: 5,
    features: ['Website URL analysis','Text content analysis','Document upload (PDF, DOCX)','AI-powered FAQ generation','Embed widget','WordPress integration','Analytics dashboard','Export functionality','Email support'] },
  { tier: 'Pro',      name: 'Pro',      priceMonthlyCents: 900,  faqLimit: 100,
    features: ['Everything in Free','Priority email support'] },
  { tier: 'Business', name: 'Business', priceMonthlyCents: 2900, faqLimit: 500,
    features: ['Everything in Pro','Phone support'] },
];
export const planByTier = (t: PlanTier) => PLANS.find(p => p.tier === t)!;
```
2. Refactor `src/components/sections/Pricing.tsx` and `src/components/dashboard/PlanUpgradeData.tsx` to map over `PLANS` (remove inline arrays/limits).
3. New migration `supabase/migrations/20250120000000_canonical_pricing.sql`:
```sql
BEGIN;
-- Canonical plan definitions
UPDATE public.subscription_plans SET faq_limit=5,   price_monthly=0,    price_yearly=0    WHERE name='Free';
UPDATE public.subscription_plans SET faq_limit=100, price_monthly=900,  price_yearly=9700 WHERE name='Pro';
UPDATE public.subscription_plans SET faq_limit=500, price_monthly=2900, price_yearly=31300 WHERE name='Business';

-- Align existing user quotas to their tier (does NOT change current usage)
UPDATE public.user_subscriptions us
SET faq_usage_limit = sp.faq_limit, updated_at = NOW()
FROM public.subscription_plans sp
WHERE us.plan_tier = sp.name
  AND us.faq_usage_limit <> sp.faq_limit;

-- Ensure signup default derives from subscription_plans (not a literal 10)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_subscriptions
    (user_id, plan_id, status, plan_activated_at, plan_expires_at, faq_usage_current, faq_usage_limit, auto_renewal)
  SELECT NEW.id, 'Free', 'active', NOW(), NOW() + INTERVAL '1 month', 0,
         COALESCE((SELECT sp.faq_limit FROM public.subscription_plans sp WHERE sp.name='Free' LIMIT 1), 5), FALSE
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
COMMIT;
```
4. Add a `migrations/README.md` note marking `20250106000000` / `20250107000000` as superseded (do **not** delete applied migrations).

**VERIFY**
- `SELECT name, faq_limit, price_monthly FROM subscription_plans ORDER BY faq_limit;` → 5/100/500.
- New signup row shows `faq_usage_limit = 5`.
- Landing page and dashboard show identical limits.

---
## P0-3 — `analyze-content` is publicly callable (`verify_jwt = false`)

**Problem:** The most expensive function (Gemini + scraping) has JWT verification disabled → any anonymous caller can burn your Gemini quota and Supabase invocation budget (cost abuse / DoS). It also uses the **service-role** key internally, bypassing RLS.

**Files & current state**
- `supabase/config.toml` L58-59: `[functions.analyze-content] verify_jwt = false`
- `supabase/functions/analyze-content/index.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`; no caller auth/usage check.

**TARGET**
1. Require auth for the real generation path:
```toml
[functions.analyze-content]
verify_jwt = true
```
   The client already calls it via `supabase.functions.invoke('analyze-content', …)` in `FAQCreator.tsx`, which auto-attaches the JWT — authenticated flows keep working.
2. **Defense in depth inside the function** — resolve the caller from the JWT and enforce quota server-side (do not trust the client pre-check):
```ts
const authHeader = req.headers.get('Authorization') ?? '';
const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

const { data: eligibility } = await supabase.rpc('can_generate_faqs', { user_uuid: user.id, faq_count: validFaqCount });
if (!eligibility?.can_generate) {
  return new Response(JSON.stringify({ error: eligibility?.reason ?? 'Quota exceeded' }), { status: 429, headers: corsHeaders });
}
```
   (`can_generate_faqs` already exists — `20250913090000_full_db_fix.sql`.)
3. If the public **Demo** (`src/pages/Demo.tsx`) needs unauthenticated generation, do **not** reuse this function. Create `analyze-content-demo` with `verify_jwt = false`, a hard per-IP rate limit, and a tiny fixed sample set (or canned results). Keep the paid path protected.
4. Add abuse controls: per-user hourly cap (table or RPC) + request size limits.

**VERIFY**
- Unauthenticated `curl` → `401`.
- Authenticated generation still succeeds and increments usage.
- Demo (if public) still works via the separate function.

---

## P0-4 — Email confirmations disabled

**Problem:** `supabase/config.toml` L53-56 sets `enable_confirmations = false` → trivial signup farming → free-quota abuse.

**CURRENT**
```toml
[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false
```
**TARGET**
```toml
[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true
```
**Frontend follow-up:** `src/hooks/useAuth.tsx` `signUp()` already passes `emailRedirectTo: ${window.location.origin}/dashboard`. Update `src/pages/SignUp.tsx` success path to an explicit **"Confirm your email to continue"** state (no immediate redirect). Brand Supabase email templates with the new domain (ties into P0-1).

**VERIFY**
- New signup cannot reach `/dashboard` until the email link is clicked.
- Confirmation link lands on the new domain.

---
## P0-5 — Build broken + no CI / tests

**Problem:** `npm run build` fails locally: `Cannot find module @rollup/rollup-darwin-arm64` (npm optional-dependency bug). There are **zero** test files and no CI.

**Local fix**
```bash
rm -rf node_modules package-lock.json && npm install
npm run build   # should produce dist/
```
**package.json** — add scripts:
```jsonc
"scripts": {
  "typecheck": "tsc --noEmit -p tsconfig.app.json",
  "test": "vitest run",
  "ci": "npm run typecheck && npm run lint && npm run build"
}
```
**Add `.github/workflows/ci.yml`:**
```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
```
**Tests (introduce Vitest + React Testing Library)** — minimum targets:
- `src/utils/validation.ts` (URL/text/file/title + rate limiter).
- `WIDGET_CONFIG.generateEmbedCode()` (valid ID, invalid ID throws, theme variants).
- A pricing-consistency test asserting `PLANS` tiers/limits (guards P0-2).
- DB smoke test for `can_generate_faqs` / `increment_faq_usage_by_count`.

**Note (tech debt):** root `tsconfig.json` sets `strictNullChecks:false`, `noImplicitAny:false`. Leave for now; schedule a separate tightening epic.

**VERIFY**
- CI green on a PR; `dist/` builds reproducibly.

---

## P0-6 — Hard-coded Supabase URL / anon-key fallbacks

**Problem:** Production credentials are baked into source as fallbacks. The anon key is public by design, but a silent fallback means a missing env var still points at prod — masking misconfiguration.

**Files & current state**
- `src/integrations/supabase/client.ts` L6-7:
```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://dlzshcshqjdghmtzlbma.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJI...B9Gk";
```
- `public/widget.js` L36 `BULLETPROOF_API_URL = 'https://dlzshcshqjdghmtzlbma.supabase.co'`.

**TARGET**
1. `client.ts` — fail fast:
```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them in .env/.env.production.');
}
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
```
2. Put real values in `.env.production` / Vercel env; keep only **placeholders** in `.env.example`.
3. Emit the widget API base from an env var (`VITE_PUBLIC_SUPABASE_URL`) in the generated snippet instead of a literal in `src/config/widget.ts`.
4. `public/widget.js` is a static CDN asset (can't read Vite env at runtime). Keep its literal but document it as the canonical public API endpoint, or generate it at build time.

**VERIFY**
- Build fails loudly if env vars are absent.
- `.env.example` contains no real keys.
- `grep -rn 'eyJhbGci' src` returns nothing.

---
## P1-7 — Razorpay plan-id column mismatch

**Problem:** `create-razorpay-subscription` reads a column that the migrations never create.

**Files & current state**
- `supabase/functions/create-razorpay-subscription/index.ts` L121: `let razorpayPlanId = (selectedPlan as any).razorpay_plan_id_usd;`
- Fallback (L124-133) hard-codes dashboard IDs `plan_Rk4UC2Kxsh78K9` (Pro) / `plan_Rk4Uu6Syvg6cZH` (Business).
- Migrations define `subscription_plans.razorpay_plan_id` and `razorpay_plan_id_inr` (`20250115000000_add_razorpay_support.sql`) — **no `razorpay_plan_id_usd`**.

Because of the hard-coded fallback it does not hard-fail today, but the DB-driven path is dead and the fallback IDs are opaque/undocumented.

**TARGET (DB-driven, remove hard-coded fallback)**
New migration `supabase/migrations/20250121000000_razorpay_usd_plan_ids.sql`:
```sql
BEGIN;
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS razorpay_plan_id_usd TEXT;

-- Seed with the current USD Razorpay Plan IDs (from the dashboard), then verify
UPDATE public.subscription_plans SET razorpay_plan_id_usd = 'plan_Rk4UC2Kxsh78K9' WHERE name='Pro';
UPDATE public.subscription_plans SET razorpay_plan_id_usd = 'plan_Rk4Uu6Syvg6cZH' WHERE name='Business';
COMMIT;
```
Then in `create-razorpay-subscription/index.ts`, **keep** the DB read but treat a missing value as a hard error (log + 500) rather than silently using a literal. Keep the literals out of source.

**VERIFY**
- `SELECT name, razorpay_plan_id_usd FROM subscription_plans;` returns the two IDs.
- Subscription checkout creates a real Razorpay subscription.

---

## P1-8 — Payment idempotency / race / hard-coded "from Free"

**Problem:** Both `verify-razorpay-payment` and `razorpay-webhook` mutate `user_subscriptions`. There is no uniqueness on gateway IDs, so webhook retries or verify+webhook races can double-activate, and history hard-codes `from_plan_tier: 'Free'`.

**Files & current state**
- `supabase/functions/verify-razorpay-payment/index.ts` L119-167 — updates transaction then `user_subscriptions`; expiry = `now + 30d` (L141).
- `supabase/functions/razorpay-webhook/index.ts` L136-195 `subscription.charged`, L250+ `subscription.activated` (sets `plan_expires_at: subscription.current_end`), L320+ `subscription.completed` (downgrades to Free, `faq_usage_limit: 5`).
- History insert hard-codes `from_plan_tier: 'Free'` (verify L184).

**TARGET**
1. Idempotency keys (new migration):
```sql
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_payment_id
  ON public.payment_transactions (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_subscription_id
  ON public.payment_transactions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sub_razorpay_sub
  ON public.user_subscriptions (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;
COMMIT;
```
2. Guard activation as idempotent: before mutating, `SELECT status FROM payment_transactions WHERE razorpay_payment_id=$1`; if already `completed`, return early `{ success:true, idempotent:true }`. Use `ON CONFLICT DO NOTHING` for history/renewal inserts.
3. Replace hard-coded history with the real previous tier:
```ts
const { data: current } = await supabase.from('user_subscriptions')
  .select('plan_tier').eq('user_id', user.id).single();
const fromTier = current?.plan_tier ?? 'Free';
```
4. Derive expiry from the gateway where available (`subscription.current_end` in webhook) instead of always `now + 30d`; keep `now+30d` only as a fallback.
5. Use **one** source of truth for plan activation: prefer the webhook; make `verify-razorpay-payment` set status but not re-write plan if already active.

**VERIFY**
- Replaying the same webhook twice yields one activation (no duplicate rows, no limit doubling).
- `subscription_history` shows correct `from_plan_tier`.

---
## P1-9 — SEO foundation missing (sitemap, meta, JSON-LD)

**Problem:** No `sitemap.xml`; `robots.txt` has no sitemap reference; the app is a client-rendered SPA with a single static `<title>`; no per-route metadata or structured data. With Google having killed FAQ rich results (May 7, 2026), the priority is **crawlable content + Organization/Product schema**, not FAQPage markup.

**Files & current state**
- `public/robots.txt` — exists, no `Sitemap:` line.
- No `public/sitemap.xml`.
- `index.html` — one `<title>`/meta block (see P0-1 for og fixes).

**TARGET**
1. `public/sitemap.xml` (or generate at build) listing `/`, `/about`, `/contact`, `/privacy`, `/terms`, `/cancellation-policy`, `/demo`.
2. `public/robots.txt` — append:
```
Sitemap: https://REPLACE_ME.example/sitemap.xml
```
3. Per-route metadata via `react-helmet-async` (add dep) or a small `Seo` component (`src/components/Seo.tsx`) setting `<title>`, `<meta name="description">`, canonical, and Open Graph per page.
4. Add **JSON-LD** for `Organization` and `SoftwareApplication` (with `offers`) in `index.html`. **Do not** rely on `FAQPage` schema for SEO (dead), though keeping it costs nothing.
5. Consider pre-rendering marketing pages (Vite SSG plugin or Vercel prerender) so crawlers see content without JS. Track separately.

**VERIFY**
- `/sitemap.xml` and `/robots.txt` resolve in production.
- Rich Results Test shows Organization/SoftwareApplication.
- Each route has a distinct `<title>`/description.

---

## P1-10 — No funnel / activation / revenue analytics

**Problem:** `track-analytics` writes events, but there is **no event taxonomy, no funnel, no attribution, and no revenue view**. You cannot see where users drop off or which channel converts.

**Files & current state**
- `supabase/functions/track-analytics/index.ts` — accepts `{ event_type, user_id, collection_id, faq_id, session_id, metadata }`, calls RPC `track_simple_analytics`.
- `src/components/dashboard/FAQCreator.tsx` L747 `trackAnalyticsEvent()` — fires a few events.

**TARGET**
1. Define a small event taxonomy and emit consistently:
   `signup`, `email_confirmed`, `first_generation`, `generation_success`, `generation_failed`, `collection_saved`, `embed_copied`, `export_clicked`, `upgrade_clicked`, `checkout_open`, `payment_success`, `payment_failed`, `subscription_cancelled`.
2. Capture attribution once at signup: `utm_*`, `referrer`, `landing_path` → store on `profiles.metadata` or a `signups` table.
3. Ensure the analytics RPC/table exists (add migration if `track_simple_analytics` or `usage_analytics` columns are missing in the live DB — verify against `20250107000001_add_faq_creator_functions.sql`).
4. Add an **internal funnel view** (feeds P1-11 admin): signup → confirmed → first generation → embed → upgrade → paid, with conversion rates and $ MRR.

**VERIFY**
- Full funnel visible for a test account end-to-end.
- A daily count query shows each stage.

---

## P1-11 — No admin / support panel

**Problem:** No way to view users, correct plans, process refunds, or inspect failures without raw SQL — a support and revenue-leak risk.

**TARGET**
1. Roles: add `public.user_roles (user_id uuid pk, role text)` with RLS (self-select only) and a `public.is_admin()` `SECURITY DEFINER` helper; seed your own user as `admin`.
2. Route `src/pages/Admin.tsx` guarded by an `AdminRoute` wrapper (checks `is_admin`).
3. Sensitive operations only via **service-role edge functions** (`admin-set-plan`, `admin-refund`, `admin-reset-usage`) that assert `is_admin()` before acting and write to `subscription_history`.
4. Views: Users, Subscriptions, Transactions (with gateway IDs), Collections, Failed generations/logs (`log-error`).

**VERIFY**
- Non-admin gets 403/redirect; admin can view and correct plans with an audit trail.

---
## P1-12 — Widget feature gaps (search, categories, layouts, a11y)

**Problem:** The embeddable widget is accordion-only with no search, categories, layout options, or accessibility; competitors (Poper, FAQWidget) ship all of these. This limits conversion/positioning and perceived value.

**Files & current state**
- `src/config/widget.ts` — `generateEmbedCode(collectionId, theme, options)` produces a self-contained inline script; `getThemeStyles()` supports `light | dark | minimal` (no `blue`/`green` despite `public/widget.js` referencing them).
- `public/widget.js` — CDN widget: has `theme-blue`, `theme-green` but no search/categories/layout.
- `src/components/dashboard/AdvancedEmbedGenerator.tsx` (424 lines) — UI for options.
- Backend `get-faq-widget/index.ts` returns `{ faqs: [{id, question, answer, order_index}] }` — no categories.

**TARGET**
1. Add widget options (thread through `generateEmbedCode` + `AdvancedEmbedGenerator`): `layout: 'accordion' | 'list' | 'columns'`, `search: boolean`, `categories: boolean`, `accentColor`, `showPoweredBy`.
2. Client-side search (filter across question+answer) — no external service needed.
3. Categories: extend `faq_collections.styling_options`/schema or add a `category` field on `faqs`; update `get-faq-widget` to return grouped data.
4. Accessibility: render questions as `<button aria-expanded>` with keyboard support; ensure color contrast.
5. Align themes across `widget.ts` and `public/widget.js` (single theme list).
6. Branding gate: hide "Powered by FAQify" only for paid tiers (ties into P1-13).

**VERIFY**
- Embed renders with search + categories + chosen layout on a test page.
- Keyboard-only navigation works; Lighthouse a11y ≥ 95.

---

## P1-13 — Free-plan abuse surface

**Problem:** Free tier gives a monthly quota **plus unlimited widgets** with no watermark, and (currently) no email confirmation — an abuse magnet.

**TARGET**
1. Complete **P0-4** (email confirmation) and **P0-3** (server-side quota enforcement).
2. Gate branding: Free tier always shows "Powered by FAQify"; paid tiers can hide it (server-driven flag from `subscription.plan_tier` in `get-faq-widget`).
3. Server-side rate limit per user/IP on generation (e.g., max N/hour) in `analyze-content`.
4. Add CAPTCHA (hCaptcha/Turnstile) on signup (and on the public demo path if kept).
5. Cap collections/embeds on Free (e.g., 1 collection, 1 embed) — enforce on the `faq_collections` insert path and in RLS/DB function, not just the UI.
6. Consider a 7-day Pro trial instead of a generous permanent free tier (matches competitor playbooks).

**VERIFY**
- Abusing scripts cannot exceed quota; Free embeds show branding; signup requires CAPTCHA + email.

---

## P1-14 — Dark-only hard-coded theming

**Problem:** Theming is hard-coded (`bg-black text-white`) across the dashboard, so there's no light mode and colors bypass design tokens. `next-themes` is already a dependency but unused.

**Files & current state**
- `src/pages/Dashboard.tsx` L61 `<div className="min-h-screen bg-black text-white">`.
- Similar hard-coded dark classes in `src/components/dashboard/*`.
- `src/App.tsx` — no `ThemeProvider`.
- `tailwind.config.ts` — dark mode is `['class']` (ready for a `dark` class strategy).

**TARGET**
1. Wrap the app in `next-themes` `ThemeProvider` (attribute="class", defaultTheme="dark") in `src/App.tsx`.
2. Add a theme toggle in `Header`/`DashboardHeader`.
3. Replace hard-coded `bg-black text-white` with semantic tokens (`bg-background text-foreground`, `bg-card`, `text-muted-foreground`).
4. Define light + dark CSS variables in `src/index.css`.

**VERIFY**
- Toggle switches themes with no contrast regressions across landing + dashboard.

---
## Appendix A — Environment variable map

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | required (P0-6) |
| `VITE_SUPABASE_ANON_KEY` | frontend | required (P0-6) |
| `VITE_PUBLIC_APP_URL` | frontend, widget | **new** — replaces hard-coded domain (P0-1) |
| `VITE_PUBLIC_SUPABASE_URL` | widget snippet | **new** — API base for embeds (P0-6) |
| `VITE_RAZORPAY_KEY_ID` | frontend checkout | existing |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | edge functions | existing (Supabase auto-injects URL/keys) |
| `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY` / `GOOGLE_GEMINI_API_KEY`) | `analyze-content` | existing; env-only (no fallback) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_SECRET_KEY`, `RAZORPAY_WEBHOOK_SECRET` | payment functions | existing |
| `PUBLIC_APP_URL` | `analyze-content` UA / `From` | **new** (P0-1) |
| `STRIPE_*` | legacy | optional |

## Appendix B — New files to create

| File | Purpose | Issue |
|---|---|---|
| `src/config/plans.ts` | Single source of truth for plans/limits | P0-2 |
| `src/config/env.ts` | Central env access + fail-fast | P0-1, P0-6 |
| `src/components/Seo.tsx` | Per-route meta/JSON-LD | P1-9 |
| `public/sitemap.xml` | Crawl map | P1-9 |
| `src/pages/Admin.tsx` + `src/components/AdminRoute.tsx` | Support panel | P1-11 |
| `supabase/functions/admin-set-plan/index.ts` | Admin plan correction | P1-11 |
| `supabase/functions/admin-refund/index.ts` | Refund handling | P1-11 |
| `supabase/functions/analyze-content-demo/index.ts` | Public demo (if needed) | P0-3 |
| `.github/workflows/ci.yml` | CI | P0-5 |
| `src/utils/validation.test.ts`, `src/config/__tests__/widget.test.ts` | Tests | P0-5 |

## Appendix C — New migrations to create (never edit applied ones)

| Migration | Purpose | Issue |
|---|---|---|
| `20250120000000_canonical_pricing.sql` | Free 5 / Pro 100 / Business 500 + signup default | P0-2 |
| `20250121000000_razorpay_usd_plan_ids.sql` | Add + seed `razorpay_plan_id_usd` | P1-7 |
| `20250122000000_payment_idempotency.sql` | Unique indexes on gateway IDs | P1-8 |
| `20250123000000_roles.sql` | `user_roles` + `is_admin()` | P1-11 |
| `20250124000000_faq_categories.sql` | Category field for widget grouping | P1-12 |
| `20250125000000_analytics_rpc.sql` | Ensure `track_simple_analytics` + columns | P1-10 |

## Appendix D — Phased rollout plan

**Phase 1 — Week 1 (revenue integrity & survival)**
- P1-8 idempotency, P0-1 domain, P0-2 pricing, P0-3 JWT, P0-4 confirmations, P0-6 env.
- Deliverable: no double-charges; app on the new domain; consistent quotas; protected AI.

**Phase 2 — Weeks 2–4 (foundations)**
- P0-5 CI/tests, P1-7 Razorpay column, P1-9 SEO, P1-13 abuse controls.
- Deliverable: green CI; crawlable site; measurable acquisition start.

**Phase 3 — Weeks 5–12 (growth & differentiation)**
- P1-10 funnel analytics, P1-14 theming, P1-12 widget features, P1-11 admin, then the **AI answer-agent** tier (separate spec).

## Appendix E — Global acceptance criteria

- [ ] `grep -rn 'faqify.app' src supabase index.html` → only comments/none.
- [ ] `npm run build` → `dist/` (no missing-module errors); CI green.
- [ ] Plans identical across landing, dashboard, and DB (5/100/500).
- [ ] Unauthenticated calls to `analyze-content` → 401; quota enforced server-side.
- [ ] Duplicate webhook delivery produces a single activation.
- [ ] Signup requires email confirmation.
- [ ] `/sitemap.xml` + `/robots.txt` live; unique `<title>` per route.
- [ ] Funnel + MRR visible internally.
- [ ] Widget supports search/categories/layout; keyboard accessible.
- [ ] Light/dark theme toggle works.

---

## Appendix F — Out-of-scope (separate specs recommended)

1. **AI answer agent** (RAG over `source_content` + faqs) — the biggest revenue lever; needs its own design.
2. **Document extraction quality** — replace byte-decode with a real PDF/DOCX parser.
3. **Scraping robustness** — headless rendering for JS-heavy sites.
4. **Model resilience** — Gemini fallback model + retry/backoff on 429/5xx.
5. **Dunning / invoice / billing portal** — for renewal recovery and GST invoices.
6. **Multi-language & auto-update-from-source** — premium add-ons.
7. **Compliance** — GDPR/DPA, cookie consent, India GST invoicing.

---

*End of specification. No source code was modified in the production of this document.*

