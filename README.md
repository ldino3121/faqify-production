# FAQify — Paddle integration and reliability update

React/TypeScript/Vite frontend, Supabase Auth/Postgres/Edge Functions, Gemini FAQ generation, published FAQ widgets, and Paddle Billing. Existing Razorpay records and subscription controls are retained.

Start with **docs/PADDLE_SETUP.md**. It covers the coordinated migration, secret names, catalog setup, notification subscriptions, staging acceptance and live rollout. **docs/REVIEW_AND_CHANGES.md** records the fixes, validation and remaining gaps.

```sh
npm ci
cp .env.example .env.local
# Fill your public frontend values before running the app.
npm run dev
```

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Never put private keys in VITE variables. No production credentials, node_modules, compiled build or diagnostic executables are distributed. Install dependencies with npm ci. Historical migration files are preserved for reference, not as a guaranteed clean schema bootstrap.
