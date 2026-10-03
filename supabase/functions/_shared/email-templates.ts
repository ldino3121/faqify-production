import { PUBLIC_APP_URL, SUPPORT_EMAIL, stripHtml } from "./email.ts";

const BRAND = "#2563eb";
const INK = "#111827";
const MUTED = "#6b7280";

export interface EmailDraft {
  subject: string;
  html: string;
  text?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function layout(opts: {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}): string {
  const cta = opts.ctaLabel && opts.ctaHref
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:6px;background:${BRAND}">
        <a href="${opts.ctaHref}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${opts.ctaLabel}</a>
      </td></tr></table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
        <tr><td>
          <div style="font-size:20px;font-weight:700;color:${BRAND};margin-bottom:24px">FAQify</div>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.65;color:${INK}">${opts.body}</div>
          ${cta}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;padding:16px 8px">
        <tr><td style="font-size:12px;line-height:1.6;color:${MUTED};text-align:center">
          ${opts.footerNote ? `${opts.footerNote}<br>` : ""}
          Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};text-decoration:none">${SUPPORT_EMAIL}</a><br>
          FAQify &middot; <a href="${PUBLIC_APP_URL}" style="color:${MUTED};text-decoration:none">${PUBLIC_APP_URL.replace("https://", "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function finalize(draft: EmailDraft): EmailDraft {
  if (!draft.text) draft.text = stripHtml(draft.html);
  return draft;
}

/* ---------------------------------------------------------------- payments */

export function receiptEmail(opts: {
  name: string | null;
  planTier: string;
  amountLabel: string;
  reference?: string | null;
  nextBillingLabel?: string | null;
}): EmailDraft {
  const rows = [
    opts.amountLabel
      ? `<tr><td style="padding:6px 0;color:${MUTED}">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.amountLabel}</td></tr>`
      : "",
    `<tr><td style="padding:6px 0;color:${MUTED}">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(opts.planTier)}</td></tr>`,
    opts.reference
      ? `<tr><td style="padding:6px 0;color:${MUTED}">Reference</td><td style="padding:6px 0;text-align:right;font-family:monospace">${esc(opts.reference)}</td></tr>`
      : "",
    opts.nextBillingLabel
      ? `<tr><td style="padding:6px 0;color:${MUTED}">Next billing date</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(opts.nextBillingLabel)}</td></tr>`
      : "",
  ].join("");

  return finalize({
    subject: `Your FAQify ${esc(opts.planTier)} payment receipt`,
    html: layout({
      preheader: "Payment received — thank you for your FAQify subscription.",
      heading: `Thanks, ${esc(opts.name || "there")}!`,
      body: `<p style="margin:0 0 16px">Your payment was successful and your FAQify plan is now active.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin:0 0 8px;font-size:14px">${rows}</table>
        <p style="margin:16px 0 0;color:${MUTED};font-size:13px">This receipt confirms payment only. No action is required.</p>`,
      ctaLabel: "View your dashboard",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
    }),
  });
}

export function paymentFailedEmail(opts: {
  name: string | null;
  planTier: string;
  amountLabel?: string;
  reason?: string | null;
  retryLabel?: string | null;
}): EmailDraft {
  return finalize({
    subject: `Action needed: your FAQify ${esc(opts.planTier)} payment failed`,
    html: layout({
      preheader: "We could not process your latest FAQify payment.",
      heading: "Your payment could not be processed",
      body: `<p style="margin:0 0 16px">Hi ${esc(opts.name || "there")}, we were unable to charge your payment method for your <strong>${esc(opts.planTier)}</strong> plan.</p>
        ${opts.amountLabel ? `<p style="margin:0 0 8px">Amount: <strong>${opts.amountLabel}</strong></p>` : ""}
        ${opts.reason ? `<p style="margin:0 0 8px">Reason: ${esc(opts.reason)}</p>` : ""}
        <p style="margin:0 0 8px">Please update your payment method to keep your plan active${opts.retryLabel ? ` — we will retry around ${esc(opts.retryLabel)}` : ""}.</p>`,
      ctaLabel: "Update payment method",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
      footerNote: "If you believe this is an error, reply to this email and we will investigate.",
    }),
  });
}

/* ---------------------------------------------------------- plan lifecycle */

export function planActivatedEmail(opts: {
  name: string | null;
  planTier: string;
  faqLimit?: string | number | null;
  expiresLabel?: string | null;
}): EmailDraft {
  return finalize({
    subject: `Your FAQify ${esc(opts.planTier)} plan is active`,
    html: layout({
      preheader: `${opts.planTier} plan activated — welcome aboard.`,
      heading: `Your ${esc(opts.planTier)} plan is live`,
      body: `<p style="margin:0 0 16px">Welcome aboard${opts.name ? `, ${esc(opts.name)}` : ""}! Your upgrade has been applied.</p>
        ${opts.faqLimit ? `<p style="margin:0 0 8px">FAQ generations included: <strong>${esc(String(opts.faqLimit))}</strong></p>` : ""}
        ${opts.expiresLabel ? `<p style="margin:0 0 8px">Renews on: <strong>${esc(opts.expiresLabel)}</strong></p>` : ""}
        <p style="margin:16px 0 0">Start creating FAQs from your dashboard whenever you're ready.</p>`,
      ctaLabel: "Start creating FAQs",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
    }),
  });
}

export function subscriptionCancelledEmail(opts: {
  name: string | null;
  planTier: string;
  untilLabel?: string | null;
}): EmailDraft {
  return finalize({
    subject: "Your FAQify subscription has been cancelled",
    html: layout({
      preheader: "Your FAQify subscription is cancelled.",
      heading: "Subscription cancelled",
      body: `<p style="margin:0 0 16px">Hi ${esc(opts.name || "there")}, your <strong>${esc(opts.planTier)}</strong> subscription has been cancelled and will not renew.</p>
        ${opts.untilLabel ? `<p style="margin:0 0 16px">You keep full access until <strong>${esc(opts.untilLabel)}</strong>.</p>` : ""}
        <p style="margin:0 0 16px">Your FAQs and collections stay exactly where they are — reactivate any time from your dashboard.</p>`,
      ctaLabel: "Reactivate plan",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
    }),
  });
}

export function welcomeEmail(opts: {
  name: string | null;
  email: string;
}): EmailDraft {
  return finalize({
    subject: "Welcome to FAQify — let's create your first FAQ",
    html: layout({
      preheader: "Welcome to FAQify. Here's how to get started in 3 minutes.",
      heading: `Welcome${opts.name ? `, ${esc(opts.name)}` : ""}!`,
      body: `<p style="margin:0 0 16px">Your FAQify account is ready. Paste a URL, upload a document, or write a few lines and we will generate a polished FAQ set in under a minute.</p>
        <ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.8">
          <li>Open the dashboard</li>
          <li>Choose a source (URL, file, or text)</li>
          <li>Generate, review, publish</li>
        </ol>
        <p style="margin:0 0 8px;color:${MUTED};font-size:13px">Account: ${esc(opts.email)}</p>`,
      ctaLabel: "Create your first FAQ",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
    }),
  });
}

export function quotaExceededEmail(opts: {
  name: string | null;
  planTier: string;
  used: number;
  limit: number;
}): EmailDraft {
  return finalize({
    subject: "You have reached your FAQ generation limit",
    html: layout({
      preheader: "You have used all of your FAQ generations for this period.",
      heading: "Generation limit reached",
      body: `<p style="margin:0 0 16px">Hi ${esc(opts.name || "there")}, you have used <strong>${opts.used} of ${opts.limit}</strong> FAQ generations on your <strong>${esc(opts.planTier)}</strong> plan.</p>
        <p style="margin:0 0 16px">Your remaining FAQs reset automatically on your billing anniversary. Upgrade now if you need more right away.</p>`,
      ctaLabel: "Upgrade plan",
      ctaHref: `${PUBLIC_APP_URL}/dashboard`,
    }),
  });
}

/* -------------------------------------------------------------- contact us */

export function contactAutoReplyEmail(opts: {
  name: string;
  messagePreview: string;
}): EmailDraft {
  return finalize({
    subject: "We received your message — FAQify Support",
    html: layout({
      preheader: "Thanks for contacting FAQify support.",
      heading: `Thanks for reaching out, ${esc(opts.name)}`,
      body: `<p style="margin:0 0 16px">We have received your message and our team will reply within 24 hours (Monday–Friday, 9 AM–6 PM EST).</p>
        <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f9fafb;border-left:3px solid ${BRAND};color:${MUTED};font-size:14px">${esc(opts.messagePreview)}</blockquote>`,
      footerNote: "Keep this thread for reference — reply to it any time to continue the conversation.",
    }),
  });
}

export function contactNotificationEmail(opts: {
  name: string;
  email: string;
  message: string;
  origin?: string | null;
  userAgent?: string | null;
  subject?: string;
}): EmailDraft {
  return finalize({
    subject: `[FAQify Contact] ${esc(opts.subject || "New message")} — from ${esc(opts.name)}`,
    html: layout({
      preheader: "New contact form submission on faqify.app.",
      heading: "New contact form submission",
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;background:#f9fafb;border-radius:8px;padding:12px 16px">
          <tr><td style="padding:4px 0;color:${MUTED}">Name</td><td style="padding:4px 0;text-align:right;font-weight:600">${esc(opts.name)}</td></tr>
          <tr><td style="padding:4px 0;color:${MUTED}">Email</td><td style="padding:4px 0;text-align:right"><a href="mailto:${esc(opts.email)}" style="color:${BRAND}">${esc(opts.email)}</a></td></tr>
          <tr><td style="padding:4px 0;color:${MUTED}">Page</td><td style="padding:4px 0;text-align:right">${esc(opts.origin || "unknown")}</td></tr>
        </table>
        <p style="margin:16px 0 8px;font-weight:600">Message</p>
        <div style="white-space:pre-wrap;font-size:15px;line-height:1.6">${esc(opts.message)}</div>
        ${opts.userAgent ? `<p style="margin:16px 0 0;font-size:12px;color:${MUTED}">${esc(opts.userAgent)}</p>` : ""}`,
      footerNote: `Reply directly to answer ${esc(opts.email)}.`,
    }),
  });
}

/* --------------------------------------------------------------- ops alert */

export function opsAlertEmail(opts: {
  title: string;
  detail: string;
  severity?: "error" | "warning";
}): EmailDraft {
  const warning = opts.severity === "warning";
  const danger = warning ? "#d97706" : "#dc2626";
  return finalize({
    subject: `[FAQify ${warning ? "WARN" : "ERROR"}] ${opts.title}`,
    html: layout({
      preheader: opts.title,
      heading: `<span style="color:${danger}">${warning ? "Warning" : "Error"}</span> — ${esc(opts.title)}`,
      body: `<pre style="margin:0;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-word">${esc(opts.detail)}</pre>`,
      footerNote: "Automated alert from the FAQify production project.",
    }),
  });
}


