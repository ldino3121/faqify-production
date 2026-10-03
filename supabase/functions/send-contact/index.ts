import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";
import {
  SUPPORT_EMAIL,
  sendEmail,
} from "../_shared/email.ts";
import {
  contactAutoReplyEmail,
  contactNotificationEmail,
} from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Public contact form receiver.
 *
 * Security notes (verify_jwt = false, so this is internet-facing):
 *  - Fixed template + fixed recipient: callers can never choose a template or
 *    an arbitrary "to" address, so this cannot be abused as an open relay.
 *  - Honeypot field silently drops bots.
 *  - Per-IP and global hourly caps guard against floods.
 *  - Submission is persisted to `contact_messages` first, so a support request
 *    is never lost even if the email provider is down.
 */

const NAME_MAX = 120;
const SUBJECT_MAX = 160;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const PER_IP_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 60;
const WINDOW_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ipHits = new Map<string, number[]>();
let globalHits: number[] = [];

function prune(list: number[]): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return list.filter((t) => t > cutoff);
}

function allowed(ip: string): boolean {
  const now = Date.now();
  globalHits = prune(globalHits);
  if (globalHits.length >= GLOBAL_PER_HOUR) return false;

  const mine = prune(ipHits.get(ip) ?? []);
  if (mine.length >= PER_IP_PER_HOUR) {
    ipHits.set(ip, mine);
    return false;
  }

  mine.push(now);
  ipHits.set(ip, mine);
  globalHits.push(now);
  return true;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!allowed(ip)) {
      // Same shape as success so bots cannot fingerprint the limit.
      return json(200, { ok: true });
    }

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const subject = String(body?.subject ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const honeypot = String(body?.website ?? "").trim();

    // Bot trap: pretend success, discard everything.
    if (honeypot) return json(200, { ok: true });

    const errors: string[] = [];
    if (name.length < 2 || name.length > NAME_MAX) {
      errors.push(`Name must be 2-${NAME_MAX} characters.`);
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      errors.push("Please enter a valid email address.");
    }
    if (subject.length > SUBJECT_MAX) {
      errors.push(`Subject must be at most ${SUBJECT_MAX} characters.`);
    }
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      errors.push(`Message must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters.`);
    }
    if (errors.length) return json(400, { ok: false, errors });

    const origin = req.headers.get("origin") ?? req.headers.get("referer");
    const userAgent = req.headers.get("user-agent");
    const effectiveSubject = subject || "General enquiry";

    // 1) Persist first — the durable record of the support request.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: insertError } = await supabase
      .from("contact_messages")
      .insert({
        name,
        email,
        subject: effectiveSubject,
        message,
        origin,
        user_agent: userAgent,
        ip_hash: await hashIp(ip),
      });

    if (insertError) {
      console.error("[contact] failed to persist submission", insertError);
      // Continue: the notification email below is a second copy.
    }

    // 2) Notify the support inbox, then auto-ack the sender. Both are best
    //    effort: sendEmail never throws.
    const notify = await sendEmail({
      to: SUPPORT_EMAIL,
      replyTo: email,
      ...contactNotificationEmail({
        name,
        email,
        message,
        origin,
        userAgent,
        subject: effectiveSubject,
      }),
    });

    const reply = await sendEmail({
      to: email,
      ...contactAutoReplyEmail({
        name,
        messagePreview:
          message.length > 200 ? message.slice(0, 200) + "…" : message,
      }),
    });

    console.log("[contact] handled", {
      notify: notify.sent ? "sent" : notify.skipped ? "skipped" : notify.reason,
      reply: reply.sent ? "sent" : reply.skipped ? "skipped" : reply.reason,
      persisted: !insertError,
    });

    return json(200, { ok: true });
  } catch (err) {
    console.error("[contact] handler error", err);
    // Never surface internals to the public endpoint.
    return json(500, { ok: false, error: "Unable to send message" });
  }
});

/** Irreversible per-IP fingerprint so we can spot abuse without storing IPs. */
async function hashIp(ip: string): Promise<string> {
  const key = Deno.env.get("SUPABASE_SECRET_KEYS") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "faqify-contact";
  const data = new TextEncoder().encode(`${key}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
