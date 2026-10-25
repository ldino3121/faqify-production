import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/env';
export const CLIENT_REVISION = 2;
export const PREVIEW_READ_ONLY = String(import.meta.env.VITE_FAQIFY_READ_ONLY) === 'true';
export type RolloutStatus = { mode: 'checking' | 'open' | 'drain' | 'frozen' | 'unavailable'; minimum_client_revision: number };
// An unanswered status request is not a maintenance failure. Keep writes fail-closed
// through requireRolloutOpen(), but wait for an actual result before showing a banner.
let status: RolloutStatus = { mode: 'checking', minimum_client_revision: 0 };
const listeners = new Set<() => void>();
export const rolloutSnapshot = () => status;
export const subscribeRollout = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(next: RolloutStatus) { status = next; listeners.forEach(listener => listener()); }
export async function refreshRollout(): Promise<RolloutStatus> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/faqify_rollout_status`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const next = await response.json();
    if (!response.ok || !['open','drain','frozen'].includes(next?.mode) || !Number.isInteger(next?.minimum_client_revision)) throw new Error('Unavailable');
    publish(next);
  } catch { publish({ ...status, mode: 'unavailable' }); }
  return status;
}
export async function requireRolloutOpen() {
  if (PREVIEW_READ_ONLY) throw new Error('Read-only preview: generation, saves and purchases are disabled.');
  const next = await refreshRollout();
  if (next.minimum_client_revision > CLIENT_REVISION) throw new Error('Export unsaved FAQs before refreshing this page.');
  if (next.mode !== 'open') throw new Error('Maintenance: keep this tab open and export unsaved FAQs. Retry later.');
}
const guardedFunctions = new Set(['assign-pro-plan','send-contact','log-error','admin-set-plan','analyze-content','create-checkout-session','create-razorpay-order',
  'create-razorpay-subscription','fix-database-plans','manage-subscription','manage-razorpay-subscription',
  'process-document','verify-razorpay-payment','track-analytics','create-paddle-checkout','paddle-customer-portal']);
// Only the configured Supabase origin receives this compatibility header. It is not
// authorization; all existing JWT/ownership/quota checks remain mandatory.
export const rolloutFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const target = new URL(SUPABASE_URL);
  const functionName = url.pathname.split('/functions/v1/')[1]?.split('/')[0];
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (PREVIEW_READ_ONLY && url.origin === target.origin) {
    const read = ['GET', 'HEAD'].includes(method) && url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/');
    const status = url.pathname === '/rest/v1/rpc/faqify_rollout_status';
    if (!read && !status) return new Response(JSON.stringify({ code: 'PREVIEW_READ_ONLY', message: 'Read-only preview: this operation is disabled.' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (url.origin === target.origin && (url.pathname.startsWith('/rest/v1/') || (functionName && guardedFunctions.has(functionName)))) {
    headers.set('x-faqify-client', String(CLIENT_REVISION));
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 426 || response.status === 503) {
    const body = await response.clone().json().catch(() => null);
    if (['PT426','CLIENT_OUTDATED'].includes(body?.code)) publish({ ...status, minimum_client_revision: CLIENT_REVISION + 1 });
    if (['PT503','MAINTENANCE'].includes(body?.code)) publish({ ...status, mode: 'frozen' });
  }
  return response;
};
