/**
 * Transactional email delivery via Resend.
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY  Required to actually deliver. If absent every send becomes a
 *                   logged no-op returning `skipped`, so payment webhooks never
 *                   fail because email is not configured yet.
 *   EMAIL_FROM      Optional sender, default "FAQify <onboarding@resend.dev>".
 *                   Must be a domain you have verified in Resend for production.
 *   SUPPORT_EMAIL   Optional reply/alert inbox, default faqify18@gmail.com.
 *   PUBLIC_APP_URL  Optional absolute link base, default https://faqify.app.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  id?: string;
}

export const SUPPORT_EMAIL =
  Deno.env.get("SUPPORT_EMAIL") || "faqify18@gmail.com";

export const PUBLIC_APP_URL = (
  Deno.env.get("PUBLIC_APP_URL") || "https://faqify.app"
).replace(/\/+$/, "");

export const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") || "FAQify <onboarding@resend.dev>";

/** Convert an HTML body to a plain-text fallback for mail clients that need it. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Razorpay stores amounts in the currency's smallest unit (paise for INR).
 * Zero-decimal currencies (JPY, KRW…) are not divided.
 */
export function formatMoney(
  minorUnits: number | null | undefined,
  currency?: string | null,
): string {
  if (minorUnits === null || minorUnits === undefined) return "";
  const cur = (currency || "INR").toUpperCase();
  const zeroDecimal = cur === "JPY" || cur === "KRW" || cur === "VND";
  const major = zeroDecimal ? minorUnits : minorUnits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
    }).format(major);
  } catch {
    return `${major.toFixed(zeroDecimal ? 0 : 2)} ${cur}`;
  }
}

/**
 * Deliver an email. Never throws: callers (payment webhooks, contact form) must
 * keep working even when email is unconfigured or the provider is down.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!input.to || !input.to.includes("@")) {
    return { sent: false, skipped: true, reason: "invalid recipient" };
  }

  if (!apiKey) {
    console.warn(
      "[email] skipped — RESEND_API_KEY not set",
      { to: input.to, subject: input.subject },
    );
    return {
      sent: false,
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    };
  }

  const payload = {
    from: EMAIL_FROM,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text ?? stripHtml(input.html),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] Resend rejected", res.status, detail);
      return {
        sent: false,
        skipped: false,
        reason: `Resend ${res.status}: ${detail.slice(0, 300)}`,
      };
    }

    const data = await res.json().catch(() => ({ id: null }));
    console.log("[email] delivered", {
      to: input.to,
      subject: input.subject,
      id: data?.id ?? null,
    });
    return { sent: true, skipped: false, id: data?.id ?? undefined };
  } catch (err) {
    console.error("[email] transport failure", err);
    return { sent: false, skipped: false, reason: String(err) };
  }
}

/** Look up a user's email from `profiles` (RLS bypassed: service role client). */
export async function resolveUserEmail(
  supabase: any,
  userId?: string | null,
): Promise<{ email: string | null; name: string | null }> {
  if (!userId) return { email: null, name: null };

  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  if (error || !data?.email) {
    console.warn("[email] could not resolve recipient", {
      userId,
      error: error?.message,
    });
    return { email: null, name: null };
  }

  return { email: data.email, name: data.full_name ?? null };
}
