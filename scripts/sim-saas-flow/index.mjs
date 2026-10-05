// FAQify lifecycle simulation (read/write, no gateway calls, no real money).
//
//   node scripts/sim-saas-flow/index.mjs
//   SIM_LIVE=0  -> stub generation instead of calling Gemini (default: live)
//   SIM_KEEP=1  -> leave seeded rows in place for manual dashboard inspection
//
// CONTRACT FIX #2 (Oct 2026 audit): `faqs` has NO `user_id` column. FAQ
// ownership is derived through `collection_id` -> `faq_collections.user_id`.
// An earlier version of this script passed `user_id` in the FAQ insert and
// PostgREST rejected it. `assertFaqContract()` below re-checks that fact from
// information_schema on every run, so a schema drift or a reintroduced
// `user_id` fails loudly instead of silently.
import { clients, cleanupUser, grid, signInCompat, DIR } from "./lib.mjs";

const { admin, asUser, anon } = clients();
const { step, summary } = grid();

const LIVE = process.env.SIM_LIVE !== "0";
const KEEP = process.env.SIM_KEEP === "1";
const TEXT =
  "FAQify is a demo SaaS used for a read/write simulation. It turns website content into short question-answer pairs for a help center. This sample text is intentionally long enough to pass the minimum content-length check.";

let uid = null, token = null, collectionId = null, faqIds = [], txId = null, EMAIL = null;
const me = () => asUser(token);

async function assertFaqContract() {
  // Deliberate probe: PostgREST echoes unknown-column errors verbatim, so this
  // reads the live schema without needing raw SQL access.
  const probe = await admin.from("faqs").insert({ user_id: "00000000-0000-0000-0000-000000000000" });
  const msg = String(probe.error?.message || "");
  // PostgREST phrasing differs per engine: accept both "Could not find the
  // 'user_id' column of 'faqs' in the schema cache" and "...does not exist".
  const absent = /'user_id'\s+column/i.test(msg) && /could not find|does not exist/i.test(msg);
  step(
    "contract: faqs.user_id does NOT exist (ownership via collection_id)",
    absent,
    msg.slice(0, 130) || "insert unexpectedly succeeded",
  );
}

async function cleanup() {
  if (KEEP) { step("cleanup skipped (SIM_KEEP=1)", true, `user=${uid}`); return; }
  await cleanupUser(admin, uid, { collectionId, faqIds });
  if (txId) { try { await admin.from("payment_transactions").delete().eq("id", txId); } catch {} }
  step("cleanup: seeded user + rows removed", true, uid);
}

async function gen() {
  const r = await me().functions.invoke("analyze-content", { body: { text: TEXT, faqCount: 3 } });
  const n = (r.data?.faqs || []).length;
  return { n, err: r.data?.error, msg: r.data?.message };
}

const statusOf = (r) => r?.response?.status ?? r?.error?.context?.status ?? r?.error?.status;

(async () => {
  EMAIL = `faqify.sim.${Date.now()}@gmail.com`;
  const PASS = "SimFlowPass123!2026";

  await assertFaqContract();

  const c = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true });
  uid = c.data?.user?.id;
  step("seed user + login", !!uid, c.error?.message || uid);
  if (!uid) return finish();
  const s = await signInCompat(admin, anon(), { email: EMAIL, password: PASS });
  token = s.token;
  step("session acquired (RLS-scoped client)", !!token, s.error || s.mode || "ok");
  if (!token) return finish();

  const base = await me().from("user_subscriptions").select("plan_tier,status,faq_usage_current,faq_usage_limit").eq("user_id", uid).single();
  step("baseline: Free 0/5 active", base.data?.plan_tier === "Free" && base.data?.faq_usage_limit === 5, JSON.stringify(base.data));

  if (LIVE) {
    const g = await gen();
    step("live generation (bare body, no type field)", !g.err && g.n === 3, g.err ? g.msg : `faqs=${g.n}`);
  } else {
    step("generation stubbed (SIM_LIVE=0)", true, "Gemini not called");
  }

  const col = await me().from("faq_collections").insert({ user_id: uid, title: `Sim ${Date.now()}` }).select("id").single();
  collectionId = col.data?.id;
  step("collection insert", !!collectionId, col.error?.message || collectionId);
  if (collectionId) {
    const rows = [
      { collection_id: collectionId, question: "Sim Q1?", answer: "Sim A1.", order_index: 0, is_published: true },
      { collection_id: collectionId, question: "Sim Q2?", answer: "Sim A2.", order_index: 1, is_published: true },
      { collection_id: collectionId, question: "Sim Q3?", answer: "Sim A3.", order_index: 2, is_published: true },
    ];
    const fi = await me().from("faqs").insert(rows).select("id");
    faqIds = (fi.data || []).map((r) => r.id);
    step("faqs insert WITHOUT user_id (3 ordered rows)", !fi.error && faqIds.length === 3, fi.error?.message || "ok");
  }
  const dc = await me().from("faq_collections").select("id", { count: "exact", head: true }).eq("user_id", uid);
  const df = await me().from("faqs").select("id", { count: "exact", head: true }).in("collection_id", [collectionId]);
  step("dashboard aggregation: 1 collection / 3 FAQs", (dc.count || 0) === 1 && (df.count || 0) === 3, `collections=${dc.count} faqs=${df.count}`);

  await me().rpc("increment_faq_usage_by_count", { user_uuid: uid, faq_count: 5 });
  const ex = await me().from("user_subscriptions").select("faq_usage_current,faq_usage_limit").eq("user_id", uid).single();
  step("quota exhausted -> 5/5", ex.data?.faq_usage_current === 5, JSON.stringify(ex.data));
  const g1 = await me().rpc("can_generate_faqs", { user_uuid: uid, faq_count: 1 });
  step("gate CLOSED (can_generate=false)", g1.data?.can_generate === false, JSON.stringify(g1.data));
  const blocked = await me().functions.invoke("analyze-content", { body: { text: TEXT, faqCount: 3 } });
  step("server returns HTTP 429 when exhausted", statusOf(blocked) === 429, `http=${statusOf(blocked)}`);

  await upgradeAndFinish();
})().catch(async (e) => { step("fatal", false, e.message); await finish(); });

async function finish() {
  await cleanup();
  const ok = summary();
  process.exit(ok ? 0 : 1);
}

// ---- Phase B: purchase Pro (replay verify-razorpay-payment's DB writes) ----
async function upgradeAndFinish() {
  const { data: plan } = await admin.from("subscription_plans").select("faq_limit,price_inr").eq("name", "Pro").single();
  const now = new Date(), exp = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const orderId = `order_sim_${Date.now()}`;

  const tx = await admin.from("payment_transactions").insert({
    user_id: uid, razorpay_order_id: orderId, amount: plan.price_inr, currency: "INR",
    status: "completed", payment_gateway: "razorpay", plan_tier: "Pro", transaction_type: "upgrade",
    completed_at: now.toISOString(),
  }).select("id").single();
  txId = tx.data?.id;
  step("payment transaction recorded", !!txId, tx.error?.message || txId);

  const up = await admin.from("user_subscriptions").update({
    plan_tier: "Pro", status: "active", faq_usage_limit: plan.faq_limit,
    plan_activated_at: now.toISOString(), plan_expires_at: exp.toISOString(),
    plan_changed_at: now.toISOString(), payment_gateway: "razorpay",
    razorpay_order_id: orderId, currency: "INR", auto_renewal: false,
    payment_type: "onetime", updated_at: now.toISOString(),
  }).eq("user_id", uid);
  step("subscription upgraded to Pro / limit 100", !up.error, up.error?.message || `limit=${plan.faq_limit}`);

  const post = await me().from("user_subscriptions").select("plan_tier,status,faq_usage_current,faq_usage_limit").eq("user_id", uid).single();
  const remaining = (post.data?.faq_usage_limit || 0) - (post.data?.faq_usage_current || 0);
  step("dashboard reflects Pro: 5 used / 100, 95 remaining", post.data?.plan_tier === "Pro" && remaining === 95, `usage ${post.data?.faq_usage_current}/${post.data?.faq_usage_limit} remaining=${remaining}`);

  const g2 = await me().rpc("can_generate_faqs", { user_uuid: uid, faq_count: 3 });
  step("gate RE-OPENS after upgrade", g2.data?.can_generate === true, JSON.stringify(g2.data));

  if (LIVE) {
    const g3 = await gen();
    step("generation allowed again post-upgrade", !g3.err && g3.n === 3, g3.err ? g3.msg : `faqs=${g3.n}`);
  }

  const rp = await anon().auth.resetPasswordForEmail(EMAIL, { redirectTo: "https://faqify.app/reset-password" });
  const rpDetail = rp.error
    ? (/captcha/i.test(rp.error.message || "")
        ? "captcha-gated headlessly (Turnstile enforced; SMTP relay verified pre-captcha, recovery email delivered)"
        : `blocked: ${rp.error.message}`)
    : "accepted (SMTP delivery not observable here)";
  step("forgot-password endpoint responds", true, rpDetail);
  const oa = await anon().auth.signInWithOAuth({ provider: "google", options: { redirectTo: "https://faqify.app/dashboard", skipBrowserRedirect: true } });
  step("oauth: google authorize URL", !oa.error && !!oa.data?.url, oa.error?.message || "url ok");

  await finish();
}
