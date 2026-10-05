import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const DIR = "/Users/carbonface/Downloads/faqify-ai-spark-main/faqify-ai-spark-main";
const REF = "dlzshcshqjdghmtzlbma";

export function keys() {
  const out = execSync(`${process.env.HOME}/bin/supabase projects api-keys --project-ref ${REF} --output env`, {
    encoding: "utf8", cwd: DIR, stdio: ["ignore", "pipe", "pipe"],
  });
  const get = (k) => {
    const m = out.match(new RegExp(`^${k}="?([^"\n]+)`, "m"));
    return m ? m[1].replace(/"$/, "").trim() : "";
  };
  const url = `https://${REF}.supabase.co`;
  const anon = get("SUPABASE_ANON_KEY");
  const service = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!anon || !service) throw new Error("could not read project api keys");
  return { url, anon, service };
}

export function clients() {
  const k = keys();
  const anon = () => createClient(k.url, k.anon, { auth: { persistSession: false } });
  const admin = createClient(k.url, k.service, { auth: { persistSession: false } });
  const asUser = (token) => createClient(k.url, k.anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const fns = (path, token, init) => {
    const h = { "Content-Type": "application/json", apikey: k.anon };
    if (token) h.Authorization = `Bearer ${token}`;
    return fetch(`${k.url}/functions/v1/${path}`, { ...init, headers: { ...h, ...(init?.headers || {}) } });
  };
  return { anon, admin, asUser, fns };
}

// ---------------------------------------------------------------------------
// Captcha compatibility (Cloudflare Turnstile).
//
// Supabase Auth now enforces Turnstile on /signup, /token?grant_type=password
// and /recover for EVERY client — headless test scripts included. Real
// browsers solve the widget (frontend sends gotrue_meta_security.captcha_token);
// Node cannot render it. signInCompat keeps the sim able to obtain a real
// RLS-scoped session:
//   1. try signInWithPassword (works when captcha is off / proves the creds);
//   2. on captcha_failed, mint an identical session through the captcha-free
//      path: admin generate_link (magiclink) -> POST /auth/v1/verify
//      {token_hash}. The JWT carries the same sub/role claims, so RLS
//      behaves exactly like a password login.
// ---------------------------------------------------------------------------
export async function signInCompat(admin, anonClient, { email, password }) {
  const s = await anonClient.auth.signInWithPassword({ email, password });
  if (!s.error && s.data?.session?.access_token) {
    return { token: s.data.session.access_token, mode: "password" };
  }
  const msg = s.error?.message || "";
  const captcha = s.error?.code === "captcha_failed" || /captcha/i.test(msg);
  if (!captcha) return { token: null, error: msg || "sign-in failed" };

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) return { token: null, error: `generate_link: ${link.error.message}` };
  // supabase-js wraps the link fields under data.properties (older: top-level data).
  const tokenHash = link.data?.properties?.hashed_token ?? link.data?.hashed_token;
  if (!tokenHash) return { token: null, error: "generate_link returned no hashed_token" };

  const { url, anon } = keys();
  const r = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    return { token: null, error: `verify: ${data.msg || `HTTP ${r.status}`}` };
  }
  return { token: data.access_token, mode: "captcha-gated password login -> admin magiclink verify" };
}

export function grid() {
  const rows = [];
  const step = (name, ok, detail = "") => {
    rows.push({ name, ok: !!ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + String(detail).slice(0, 150) : ""}`);
  };
  const summary = () => {
    const p = rows.filter((r) => r.ok).length;
    console.log(`\nGRID: ${p}/${rows.length} passed`);
    return rows.every((r) => r.ok);
  };
  return { step, summary };
}

export async function cleanupUser(admin, uid, { collectionId = null, faqIds = [] } = {}) {
  const tables = ["usage_analytics", "error_logs", "contact_messages"];
  for (const t of tables) { try { await admin.from(t).delete().eq("user_id", uid); } catch {} }
  try { if (faqIds.length) await admin.from("faqs").delete().in("id", faqIds); } catch {}
  try { if (collectionId) await admin.from("faq_collections").delete().eq("id", collectionId); } catch {}
  for (const t of ["subscription_history", "subscription_usage_logs", "user_subscriptions"]) {
    try { await admin.from(t).delete().eq("user_id", uid); } catch {}
  }
  try { await admin.from("profiles").delete().eq("id", uid); } catch {}
  try { await admin.auth.admin.deleteUser(uid); } catch {}
}
