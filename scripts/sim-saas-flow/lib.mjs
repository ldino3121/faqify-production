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
