// FAQify plan-lifecycle simulation — every plan-buying scenario, no gateway,
// no real money. Each scenario replays the EXACT column writes of the deployed
// edge functions, then asserts the REAL Postgres gates:
//
//   * can_generate_faqs()          — server-side quota + expiry gate (reads plan_id!)
//   * increment_faq_usage_by_count — quota consumption
//   * reset_monthly_usage()        — the pg_cron monthly reset routine
//   * sync_plan_id_on_plan_tier    — trigger keeping enum plan_id == text plan_tier
//
//   node scripts/sim-plan-lifecycle/index.mjs
//   SIM_KEEP=1 -> leave the seeded user in place for manual inspection
//
// Scenarios:
//   S1  Free baseline (5 FAQs, sentinel expiry, gates open)
//   S2  Exhaust Free quota -> gate closes (server 429 path)
//   S3  Buy Pro mid-month (one-time) -> 0/100, expiry now+30d, plan_id synced
//   S4  Exhaust Pro 100/100 -> repurchase -> 0/100 again (quota credit regression)
//   S5  Recurring activation -> expiry = now + 1 calendar month (current_end)
//   S6  Pro -> Business switch mid-month -> 0/500, new sub id, plan_id synced
//   S7  Renewal (subscription.charged) -> expiry pushed, quota reset
//   S8  Expired paid plan -> server gate CLOSED with reason "Expired"
//   S9  subscription.completed -> Free 0/5 + sentinel + status active
//   S10 Monthly reset: due window -> usage zeroed, window re-anchored
import { clients, cleanupUser, grid } from "../sim-saas-flow/lib.mjs";

const { admin } = clients();
const { step, summary } = grid();

const KEEP = process.env.SIM_KEEP === "1";
const DAY = 24 * 3600 * 1000;
let uid = null;

const row = async () => {
  const { data, error } = await admin.from("user_subscriptions").select("*").eq("user_id", uid).single();
  if (error) throw new Error(`row fetch failed: ${error.message}`);
  return data;
};
const gate = (n) => admin.rpc("can_generate_faqs", { user_uuid: uid, faq_count: n });
const near = (a, b, tolMs = 5000) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= tolMs;

// EXACT payload of supabase/functions/verify-razorpay-payment (one-time order).
function oneTimePurchasePayload(tier, limit) {
  const now = new Date();
  return {
    plan_tier: tier,
    payment_gateway: "razorpay",
    currency: "USD",
    status: "active",
    faq_usage_limit: limit,
    faq_usage_current: 0,
    last_reset_date: now.toISOString(),
    plan_activated_at: now.toISOString(),
    plan_expires_at: new Date(now.getTime() + 30 * DAY).toISOString(),
    plan_changed_at: now.toISOString(),
    auto_renewal: false,
    payment_type: "onetime",
    billing_cycle: "monthly",
    subscription_source: "razorpay_onetime",
    razorpay_subscription_id: null,
    next_billing_date: null,
    cancelled_at: null,
    cancellation_reason: null,
    updated_at: now.toISOString(),
  };
}

// EXACT payload of razorpay-webhook `subscription.activated` (recurring first cycle).
function activatedPayload(tier, limit, subId) {
  const now = new Date();
  const currentEnd = new Date(now);
  currentEnd.setMonth(currentEnd.getMonth() + 1); // Razorpay monthly period end
  return {
    razorpay_subscription_id: subId,
    status: "active",
    plan_tier: tier,
    faq_usage_limit: limit,
    faq_usage_current: 0,
    last_reset_date: now.toISOString(),
    plan_activated_at: now.toISOString(),
    plan_expires_at: currentEnd.toISOString(),
    updated_at: now.toISOString(),
  };
}

// EXACT payload of razorpay-webhook `subscription.charged` (renewal).
function chargedPayload(prevExpiry) {
  const now = new Date();
  const currentEnd = new Date(prevExpiry);
  currentEnd.setMonth(currentEnd.getMonth() + 1);
  return {
    plan_expires_at: currentEnd.toISOString(),
    status: "active",
    faq_usage_current: 0,
    last_reset_date: now.toISOString(),
    updated_at: now.toISOString(),
    _nextBilling: currentEnd.toISOString(),
  };
}

const apply = async (payload) => {
  const { _nextBilling, ...dbPayload } = payload;
  const { error } = await admin.from("user_subscriptions").update(dbPayload).eq("user_id", uid);
  if (error) throw new Error(`update failed: ${error.message}`);
  return _nextBilling;
};

(async () => {
  const EMAIL = `faqify.lifecycle.${Date.now()}@gmail.com`;
  const c = await admin.auth.admin.createUser({ email: EMAIL, password: "LifecyclePass123!2026", email_confirm: true });
  uid = c.data?.user?.id;
  step("seed user", !!uid, c.error?.message || uid);
  if (!uid) return finish();

  // ---- S1: Free baseline -------------------------------------------------
  let r = await row();
  step("S1 Free 0/5 active", r.plan_tier === "Free" && r.plan_id === "Free" && r.faq_usage_current === 0 && r.faq_usage_limit === 5, `${r.plan_tier}/${r.plan_id} ${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S1 Free sentinel expiry (dashboard renders 'Never')", new Date(r.plan_expires_at).getUTCFullYear() >= 2099, r.plan_expires_at);
  let g = await gate(1);
  step("S1 gate open for 1 FAQ", g.data?.can_generate === true, JSON.stringify(g.data));

  // ---- S2: exhaust Free --------------------------------------------------
  await admin.rpc("increment_faq_usage_by_count", { user_uuid: uid, faq_count: 5 });
  r = await row();
  step("S2 Free exhausted -> 5/5", r.faq_usage_current === 5, `${r.faq_usage_current}/${r.faq_usage_limit}`);
  g = await gate(1);
  step("S2 gate CLOSED when exhausted", g.data?.can_generate === false, JSON.stringify(g.data));

  // ---- S3: buy Pro mid-month (one-time) ---------------------------------
  await apply(oneTimePurchasePayload("Pro", 100));
  r = await row();
  step("S3 Pro activated: 0/100 credited", r.plan_tier === "Pro" && r.faq_usage_current === 0 && r.faq_usage_limit === 100, `${r.plan_tier} ${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S3 plan_id enum synced to Pro (trigger)", r.plan_id === "Pro", `plan_id=${r.plan_id}`);
  step("S3 expiry = purchase + 30 days", near(r.plan_expires_at, Date.now() + 30 * DAY), r.plan_expires_at);
  g = await gate(100);
  step("S3 gate open for full 100-FAQ batch", g.data?.can_generate === true, JSON.stringify(g.data));
  g = await gate(101);
  step("S3 gate closed above the 100 limit", g.data?.can_generate === false, JSON.stringify(g.data));

  // ---- S4: exhaust Pro, repurchase (quota-credit regression) ------------
  await admin.from("user_subscriptions").update({ faq_usage_current: 100, last_reset_date: new Date(Date.now() - 40 * DAY).toISOString() }).eq("user_id", uid);
  g = await gate(1);
  step("S4 Pro exhausted 100/100 -> gate CLOSED", g.data?.can_generate === false, JSON.stringify(g.data));
  await apply(oneTimePurchasePayload("Pro", 100));
  r = await row();
  step("S4 repurchase credits 0/100 immediately", r.faq_usage_current === 0 && r.faq_usage_limit === 100, `${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S4 reset window re-anchored to purchase", near(r.last_reset_date, Date.now(), 10000), r.last_reset_date);
  g = await gate(100);
  step("S4 gate re-opened after repurchase", g.data?.can_generate === true, JSON.stringify(g.data));

  // ---- S5: recurring activation (current_end = +1 calendar month) --------
  await apply(activatedPayload("Pro", 100, "sub_lifecycle_first"));
  r = await row();
  const expectedEnd = new Date(); expectedEnd.setMonth(expectedEnd.getMonth() + 1);
  step("S5 recurring expiry = now + 1 calendar month", near(r.plan_expires_at, expectedEnd.getTime(), 10000), `${r.plan_expires_at} vs ${expectedEnd.toISOString()}`);
  step("S5 sub id recorded", r.razorpay_subscription_id === "sub_lifecycle_first", r.razorpay_subscription_id);

  await runSecondHalf();
})().catch(async (e) => { step("fatal", false, e.message); await finish(); });

async function runSecondHalf() {
  let r, g;

  // ---- S6: Pro -> Business switch mid-month ------------------------------
  await admin.from("user_subscriptions").update({ faq_usage_current: 61 }).eq("user_id", uid); // consumed mid-cycle
  const oldSub = (await row()).razorpay_subscription_id;
  await apply(activatedPayload("Business", 500, "sub_lifecycle_switch"));
  r = await row();
  step("S6 Business switch: 0/500 credited", r.plan_tier === "Business" && r.faq_usage_current === 0 && r.faq_usage_limit === 500, `${r.plan_tier} ${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S6 plan_id enum synced to Business (trigger)", r.plan_id === "Business", `plan_id=${r.plan_id}`);
  step("S6 row repointed to new sub id (old id superseded)", r.razorpay_subscription_id === "sub_lifecycle_switch" && oldSub === "sub_lifecycle_first", `${oldSub} -> ${r.razorpay_subscription_id}`);
  const newEnd = new Date(); newEnd.setMonth(newEnd.getMonth() + 1);
  step("S6 new validity = switch + 1 calendar month (no proration)", near(r.plan_expires_at, newEnd.getTime(), 10000), r.plan_expires_at);
  g = await gate(500);
  step("S6 gate open for full 500 batch", g.data?.can_generate === true, JSON.stringify(g.data));

  // ---- S7: renewal (subscription.charged) --------------------------------
  await admin.from("user_subscriptions").update({ faq_usage_current: 37 }).eq("user_id", uid);
  const prevExpiry = (await row()).plan_expires_at;
  const nextBilling = await apply(chargedPayload(prevExpiry));
  r = await row();
  step("S7 renewal pushes expiry +1 month", near(r.plan_expires_at, nextBilling, 1000) && new Date(r.plan_expires_at) > new Date(prevExpiry), `${prevExpiry} -> ${r.plan_expires_at}`);
  step("S7 renewal resets quota to 0", r.faq_usage_current === 0, `${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S7 still Business 0/500", r.plan_tier === "Business" && r.faq_usage_limit === 500, `${r.plan_tier} ${r.faq_usage_limit}`);

  // ---- S8: expired paid plan -> server gate must close -------------------
  await admin.from("user_subscriptions").update({ plan_expires_at: new Date(Date.now() - DAY).toISOString() }).eq("user_id", uid);
  g = await gate(1);
  step("S8 expired paid -> server gate CLOSED (reason Expired)", g.data?.can_generate === false && String(g.data?.reason).includes("Expired"), JSON.stringify(g.data));

  // ---- S9: subscription.completed -> Free downgrade ----------------------
  const now = new Date();
  await apply({
    plan_tier: "Free",
    status: "active",
    faq_usage_limit: 5,
    faq_usage_current: 0,
    last_reset_date: now.toISOString(),
    plan_expires_at: new Date("2099-12-31T23:59:59Z").toISOString(),
    updated_at: now.toISOString(),
  });
  r = await row();
  step("S9 downgraded to Free 0/5 active", r.plan_tier === "Free" && r.plan_id === "Free" && r.status === "active" && r.faq_usage_current === 0 && r.faq_usage_limit === 5, `${r.plan_tier}/${r.plan_id} ${r.status} ${r.faq_usage_current}/${r.faq_usage_limit}`);
  step("S9 sentinel restored (dashboard 'Never')", new Date(r.plan_expires_at).getUTCFullYear() >= 2099, r.plan_expires_at);
  g = await gate(5);
  step("S9 gate open for 5 Free FAQs", g.data?.can_generate === true, JSON.stringify(g.data));
  g = await gate(6);
  step("S9 gate closed above Free limit", g.data?.can_generate === false, JSON.stringify(g.data));

  // ---- S10: monthly reset routine (pg_cron body) -------------------------
  await admin.from("user_subscriptions").update({
    faq_usage_current: 5,
    last_reset_date: new Date(Date.now() - 40 * DAY).toISOString(),
  }).eq("user_id", uid);
  const { data: resetCount, error: resetErr } = await admin.rpc("reset_monthly_usage");
  r = await row();
  step("S10 monthly reset zeroed due usage", !resetErr && r.faq_usage_current === 0, `returned=${resetCount} usage=${r.faq_usage_current}`);
  step("S10 reset window re-anchored to now", near(r.last_reset_date, Date.now(), 60000), r.last_reset_date);

  await finish();
}

async function finish() {
  if (KEEP) {
    step("cleanup skipped (SIM_KEEP=1)", true, `user=${uid}`);
  } else if (uid) {
    try { await cleanupUser(admin, uid); step("cleanup: seeded user removed", true, uid); }
    catch (e) { step("cleanup", false, e.message); }
  }
  process.exit(summary() ? 0 : 1);
}

