# Email & SMTP Setup

FAQify has two **separate** email paths. They need configuring independently —
this is the single most common reason a SaaS "sends no mail".

| Path | What it sends | Configured where |
|---|---|---|
| **A. Transactional** (edge functions + Resend) | Receipts, plan activated, payment failed, cancellation, contact form, ops alerts | Supabase **Edge Function Secrets** |
| **B. Supabase Auth** (magic links, signup confirm, password reset, email change) | Auth lifecycle mail | Supabase **Dashboard → Authentication → Emails → SMTP** |

> Path A is now built and deployed. Path B is **not** configured yet — see below.

---

## Path A — Transactional email (Resend)

### 1. Get a Resend API key

Create an account at <https://resend.com>, then create an API key.

For **testing only**, Resend lets you send from `onboarding@resend.dev` to
your own inbox. For production, verify your domain (`faqify.app`) in Resend so
you can send from e.g. `no-reply@faqify.app`.

### 2. Set the secrets

```bash
cd faqify-ai-spark-main

supabase secrets set \
  RESEND_API_KEY="re_xxxxxxxxxxxxxxxx" \
  EMAIL_FROM="FAQify <no-reply@faqify.app>" \
  SUPPORT_EMAIL="faqify18@gmail.com"
```

No restart or redeploy is needed — `Deno.env.get()` reads them at request time.

**Until `RESEND_API_KEY` is set every send is a silent no-op** that logs
`[email] skipped — RESEND_API_KEY not set`. Nothing breaks: payment webhooks
still return `200`, so Razorpay never retries or marks the delivery failed.

### 3. Verify

```bash
# Should now show RESEND_API_KEY, EMAIL_FROM, SUPPORT_EMAIL in the digest list
supabase secrets list --project-ref dlzshcshqjdghmtzlbma
```

Then send yourself a message through the contact form at
<https://faqify.app/contact> and check `supabase functions logs send-contact`.

---

### What is wired

| Trigger | Email | Sent from |
|---|---|---|
| `payment.captured` | Payment receipt | `razorpay-webhook` |
| `subscription.charged` | Renewal receipt (with next billing date) | `razorpay-webhook` |
| `payment.failed` | Payment failed | `razorpay-webhook` |
| `subscription.activated` | Plan activated | `razorpay-webhook` |
| `subscription.cancelled` | Cancellation confirmation | `razorpay-webhook` |
| `subscription.pending` | **Dunning** — renewal failed | `razorpay-subscription-webhook` |
| `subscription.halted` | Final retry failed / plan stopped | `razorpay-subscription-webhook` |
| Contact form | Notification to support inbox + auto-reply to sender | `send-contact` |
| Client/edge error | Ops alert (max 1 per 15 min) | `log-error` |

Design notes:

- `sendEmail()` **never throws** and is a no-op without a key, so an email outage
  can never make a webhook return non-2xx (which would cause Razorpay to retry).
- Activated/charged/cancelled are emailed from `razorpay-webhook` **only**, so
  a customer never gets two copies of the same notice.
- `send-contact` has a fixed recipient and a fixed template — it can never be
  used as an open relay. It also has a honeypot field and per-IP rate caps
  (3/hour) plus a global cap (60/hour).
- Submissions are written to `contact_messages` **before** sending, so a support
  request survives even if the mail provider is down.

---

## Path B — Supabase Auth SMTP (this is the actual "SMTP" gap)

Auth emails — **confirm your signup, magic link, reset password, change address** —
do **not** go through the edge function above. Supabase sends them itself, and
right now no custom SMTP is configured. That means:

- Mail arrives from `noreply@supabase.co` (not your brand),
- Supabase's shared IP pool is used → weaker deliverability,
- On the free plan you hit a hard **~30–40 emails/hour** cap,
- `site_url` in `config.toml` still says `http://localhost:8082`, so confirm/reset
  links need the dashboard value to point at `https://faqify.app/dashboard`.

### Configure Resend's SMTP relay

Resend exposes a standard SMTP endpoint, so you can use the same key from Path A:

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Username | `resend` |
| Password | your `RESEND_API_KEY` (`re_…`) |
| Sender email | `no-reply@faqify.app` (after domain verification) |
| Sender name | `FAQify` |

Steps:

1. Resend → **Domains** → add `faqify.app` → publish the SPF/DKIM/DMARC records
   Resend gives you (at your DNS provider).
2. Supabase Dashboard → **Authentication → Emails** → enable **SMTP settings**
   → paste the table above.
3. While there, set **Sender email / Sender name**.
4. Same page → **URL Configuration**: `Site URL` = `https://faqify.app/dashboard`,
   and confirm `faqify.app/*` + `www.faqify.app/*` are in the redirect allow-list
   (they are already in `supabase/config.toml`, but the dashboard is what
   production actually reads).
5. **Templates** → brand `Confirm signup`, `Magic Link`, `Reset Password`,
   `Change Email`. Available variables include `{{ .ConfirmationURL }}`,
   `{{ .SiteURL }}`, `{{ .Email }}`.

Local development already has a catcher: `[inbucket]` in `config.toml` runs a
mail server on SMTP port **54326** — check `http://localhost:54326` instead of
expecting real mail.

---

## Deliverability checklist

- [ ] Domain verified in Resend; SPF, DKIM and DMARC records published.
- [ ] `EMAIL_FROM` uses a mailbox **on the verified domain**.
- [ ] Supabase Auth SMTP configured (Path B) — otherwise signup/reset mail is
      still on Supabase's shared pool.
- [ ] `PUBLIC_APP_URL` secret = `https://faqify.app` (already set) so links in
      mail are absolute and correct.
- [ ] Send a test signup, a password reset, and a contact-form message from a
      real mailbox, then check <https://www.mail-tester.com> or your Resend
      dashboard's delivery logs.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing sends, logs say `[email] skipped — RESEND_API_KEY not set` | Secret missing — run `supabase secrets set` |
| `Resend 422` about `from` | Domain not verified, or `EMAIL_FROM` domain mismatch |
| `Resend 403` | Key revoked, or still on the trial/`onboarding@resend.dev` restriction |
| Auth emails never arrive | Path B SMTP not configured, or hourly cap hit |
| Links in mail point at localhost | `PUBLIC_APP_URL` secret / dashboard `Site URL` wrong |
| Webhook returns 400 | Razorpay signature mismatch (`RAZORPAY_WEBHOOK_SECRET`) — unrelated to email |

