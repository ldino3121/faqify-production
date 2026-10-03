import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";
import { SUPPORT_EMAIL, sendEmail } from "../_shared/email.ts";
import { opsAlertEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Client/edge error sink.
 *
 *  - Persists to `error_logs` (created in 20251003000000_saas_gaps_*).
 *  - Emits an email alert to the ops inbox, rate limited to one every
 *    ALERT_COOLDOWN_MS so a broken release pages you once, not 10,000 times.
 *  - Public (`verify_jwt = false`) so logged-out visitors' errors are captured,
 *    therefore it is length-capped and per-IP rate limited.
 *  - Never throws and never returns internals to the caller.
 */

const MSG_MAX = 2000;
const STACK_MAX = 8000;
const CONTEXT_MAX = 4000;
const PER_IP_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

let lastAlertAt = 0;
const ipHits = new Map<string, number[]>();

function prune(list: number[]): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return list.filter((t) => t > cutoff);
}

function withinLimit(ip: string): boolean {
  const mine = prune(ipHits.get(ip) ?? []);
  if (mine.length >= PER_IP_PER_HOUR) {
    ipHits.set(ip, mine);
    return false;
  }
  mine.push(Date.now());
  ipHits.set(ip, mine);
  return true;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clip(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "… [truncated]" : s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { ok: false });

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!withinLimit(ip)) return json(200, { ok: true });

    const payload = await req.json();
    const error = payload?.error ?? {};
    const context = payload?.context ?? {};

    const message =
      clip(error?.message ?? error, MSG_MAX) ?? "Unknown error";
    const stack = clip(error?.stack, STACK_MAX);
    const contextObj = buildContext(context);
    const contextText = contextObj ? JSON.stringify(contextObj) : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: dbError } = await supabase.from("error_logs").insert({
      user_id: typeof payload?.userId === "string" ? payload.userId : null,
      error_message: message,
      error_stack: stack,
      error_context: contextObj,
      user_agent: req.headers.get("user-agent"),
      origin: req.headers.get("origin"),
      timestamp: payload?.timestamp ?? new Date().toISOString(),
    });

    if (dbError) console.error("[log-error] persist failed", dbError);

    // One alert per cooldown window keeps a runaway bug from flooding inboxes.
    const now = Date.now();
    if (now - lastAlertAt >= ALERT_COOLDOWN_MS && shouldAlert(message)) {
      lastAlertAt = now;
      await sendEmail({
        to: SUPPORT_EMAIL,
        ...opsAlertEmail({
          title: message.slice(0, 160),
          detail: [stack ?? "", contextText ?? ""].filter(Boolean).join("\n\n").slice(0, 3000),
        }),
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("[log-error] handler error", err);
    return json(200, { ok: true });
  }
});

/** Benign, user-driven failures should not page anyone. */
function shouldAlert(message: string): boolean {
  const ignore = [
    "NetworkError",
    "Failed to fetch",
    "Load failed",
    "signal is aborted",
    "ResizeObserver",
    "Non-Error",
  ];
  return !ignore.some((needle) => message.includes(needle));
}

/** Keeps `error_context` valid JSON — never store a truncated JSON string. */
function buildContext(context: unknown): Record<string, unknown> | null {
  if (!context || typeof context !== "object") return null;
  try {
    const raw = JSON.stringify(context);
    if (raw.length <= CONTEXT_MAX) return JSON.parse(raw);
    return { _truncated: true, preview: raw.slice(0, 1000) };
  } catch {
    return null;
  }
}
