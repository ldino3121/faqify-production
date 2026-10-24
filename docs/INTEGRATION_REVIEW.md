> Current security status: see [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Credentials described below have now been removed from working files, the catalog script is hardened, and the audit is down to 13 findings with zero critical. The rest of this document records the initial import review.

# Local Paddle integration review

The updated source was imported into `integration/paddle-sandbox`, based on `origin/main` at `1725557`. Repository-only files and CI were preserved. No files were deleted; no environment files, credentials, dependency directories, build outputs, or Git metadata were copied from the extract. Trailing whitespace in imported modified source was cleaned.

## Validation

- `npm ci`: passed; 531 packages installed.
- App TypeScript check: passed.
- Vitest: 64 tests across nine files passed on Node 24 and CI-compatible Node 20. Database tests use isolated PGlite, not Supabase.
- ESLint: zero errors, 72 warnings (typing, hooks, fast refresh).
- Production build: passed with placeholder public Supabase/app configuration and sandbox billing settings; no service connectivity is implied.
- Deno 2.5.6: all 16 imported changed/new Edge Function entrypoints passed. The broader check initially found 11 unknown-catch-variable errors in eight legacy handlers; safe Error narrowing fixes them.
- `git diff --check`: passed.
- Dependency audit: 43 findings (11 moderate, 30 high, two critical). Critical findings are Vitest and transitive tinypool. No automatic or breaking dependency upgrade was performed.

## CI and hosting

`.github/workflows/ci.yml` is preserved unchanged. It uses Node 20, `npm ci`, production build, tests, app typecheck, and lint as hard gates. Vitest already includes the new tests and provides placeholder public test configuration. CI does not check Deno functions or gate dependency advisories. Local Node 20 tests passed. Existing tracked production environment files remain untouched, so future CI builds still need an environment-file cleanup/configuration review.

`vercel.json` is unchanged: Vite, `npm ci`, `npm run build`, `dist`, SPA rewrites, and existing security headers. No Vercel settings were accessed or changed.

## Configuration and rollout conflicts

- Do not run `scripts/setup-paddle.mjs` against the existing catalog: its product reuse checks require custom metadata absent from the products created in this session. It could create duplicates. Price reuse also does not check tax mode or trials. Use the four existing sandbox price IDs.
- Environment files were intentionally not copied. The repository's existing `.env.example` is therefore still the older template. The extracted `supabase/paddle-secrets.example` was also excluded by the conservative credential-file filter. Use the variable names below rather than assuming those templates were updated.
- Frontend: `VITE_BILLING_PROVIDER=paddle`, `VITE_PADDLE_ENVIRONMENT=sandbox`, `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_ENABLE_ONETIME=true`; retain public Supabase/app URL/key and applicable Turnstile/Razorpay configuration.
- Backend: `PADDLE_ENVIRONMENT=sandbox`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PUBLIC_APP_URL`, `PADDLE_PRO_MONTHLY_PRICE_ID`, `PADDLE_PRO_ONETIME_PRICE_ID`, `PADDLE_BUSINESS_MONTHLY_PRICE_ID`, `PADDLE_BUSINESS_ONETIME_PRICE_ID`. Runtime code expects `PADDLE_API_KEY`, not `PADDLE_SANDBOX_API_KEY`. Keep credentials backend-only. Preserve existing Supabase, Gemini, Resend and Razorpay secrets.
- The new migration changes subscription status to text, replaces billing read policies, restricts client billing writes/direct FAQ inserts, and adds atomic generation/save and payment fulfillment. Inspect the actual existing staging schema and `is_admin()` before applying it once. Do not replay historical migrations. Coordinate frontend/functions/migration rollout; old clients will lose the old direct-insert save path.
- Supabase config changes local auth's site URL from port 8082 to 8081 and retains 8082 redirect URLs. Provider webhooks authenticate in code with signatures instead of gateway JWTs.
- Legacy Razorpay one-time payment paths remain separate fulfillment operations and require provider-level regression testing before enabling fallback for new purchases. No provider calls or deployed browser acceptance tests were performed.

## Security cleanup still needed

Repository-only files were preserved as requested. No credential validity was tested and no values are included here.

- `deploy-functions.js:5` contains a JWT whose decoded role is `service_role`. Remove that embedded credential from current source and rotate/revoke it if valid; Git history remains a separate cleanup concern.
- The files below contain Google API-key-shaped literals. Remove embedded private keys from historical source/docs, and rotate/restrict any still-valid keys. They were not introduced by this import:
  - `COMPLETE-CODEBASE-INDEX-2025.md:241`
  - `DEPLOY-READY-FUNCTION.ts:16`
  - `FAQ-COUNT-ISSUE-ANALYSIS.md:143`
  - `FAQIFY-CODEBASE-INDEX.md:234`
  - `FIXES-IMPLEMENTED.md:53`
  - `GEMINI-INTEGRATION-SUCCESS.md:11`
  - `QUICK-START-TESTING-GUIDE.md:66`
  - `SUPABASE-ENVIRONMENT-SETUP.md:26`
  - `SUPABASE-ENVIRONMENT-SETUP.md:44`
  - `SUPABASE-ENVIRONMENT-SETUP.md:68`
  - `TEST-RESULTS.md:61`

- Other historical files contain JWTs with `anon` role; those are public client keys, not service-role credentials. Their presence alone is not proof of privileged credential exposure.
- Existing tracked `.env.production` and `.env.test` were not copied, printed, modified, or audited for secret values. Review them privately before a future commit and remove any private credentials from version control.
- Intentionally removed behavior in the imported application: browser-controlled quota increments/direct FAQ creation, permissive billing writes, duplicate webhook implementations, sensitive diagnostic logs, and unsupported analytics claims in the new pricing UI. Legacy billing components remain available for compatibility. No repository files were removed.

No database migration was applied, no function/site was deployed, and no commit, push, or Vercel change was made.
