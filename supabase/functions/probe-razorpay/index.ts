import { requireAdmin } from '../_shared/require-admin.ts';
// TEMPORARY DIAGNOSTIC - reports which Razorpay mode the configured key belongs to and which Plans/Subscriptions that key can see. Deleted after use.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
    const secret = Deno.env.get("RAZORPAY_SECRET_KEY") ?? Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
    if (!keyId || !secret) return json({ error: "Razorpay credentials not configured" }, 500);

    const auth = "Basic " + btoa(keyId + ":" + secret);
    const mode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown-prefix";

    const plansRes = await fetch("https://api.razorpay.com/v1/plans?per_page=100", { headers: { Authorization: auth } });
    const plansBody = plansRes.ok ? await plansRes.json() : { error: await plansRes.text() };

    const subsRes = await fetch("https://api.razorpay.com/v1/subscriptions?count=30", { headers: { Authorization: auth } });
    const subsBody = subsRes.ok ? await subsRes.json() : { error: await subsRes.text() };

    return json({
      key_prefix: keyId.slice(0, 11),
      mode,
      plans_status: plansRes.status,
      plans: (plansBody?.items ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        amount: (p.item as Record<string, unknown> | undefined)?.amount,
        currency: (p.item as Record<string, unknown> | undefined)?.currency,
        period: p.period,
        interval: p.interval,
        total_count: p.total_count,
      })),
      plans_error: plansBody?.error,
      subscriptions_status: subsRes.status,
      subscriptions: (subsBody?.items ?? []).map((s: Record<string, unknown>) => ({
        id: s.id,
        status: s.status,
        plan_id: s.plan_id,
        created_at: s.created_at,
      })),
      subscriptions_error: subsBody?.error,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
