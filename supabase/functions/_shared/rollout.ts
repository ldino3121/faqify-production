// No provider calls occur before admission; retain leases until all awaited work ends.
// Used by both captured original handlers and the new release. Fail closed on outage.
type Handler = (request: Request) => Response | Promise<Response>;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: string }>;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-faqify-client, paddle-signature, x-razorpay-signature, stripe-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
};
export function guardedHandler(handler: Handler, name: string, client: boolean, rpc: Rpc): Handler {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    let lease: string | undefined;
    try {
      const raw = request.headers.get('x-faqify-client') ?? '0';
      const revision = /^[0-9]{1,8}$/.test(raw) ? Number(raw) : 0;
      const admission = await rpc('faqify_enter_operation', { p_function: name, p_revision: revision, p_client: client });
      if (admission.error || typeof admission.data !== 'string') {
        const stale = admission.error === 'PT426';
        return new Response(JSON.stringify({ code: stale ? 'CLIENT_OUTDATED' : 'MAINTENANCE', error: stale
          ? 'Export unsaved FAQs before refreshing this page.' : 'Maintenance: keep this tab open and export unsaved FAQs. Retry later.' }),
        { status: stale ? 426 : 503, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '30' } });
      }
      lease = admission.data;
      return await handler(request);
    } catch {
      return new Response(JSON.stringify({ code: 'MAINTENANCE', error: 'Service temporarily unavailable. Keep unsaved work and retry later.' }),
        { status: 503, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '30' } });
    } finally {
      if (lease) {
        try {
          const released = await rpc('faqify_leave_operation', { p_id: lease });
          if (released.error) console.error('Rollout lease release failed; operator reconciliation required.');
        } catch { console.error('Rollout lease release failed; operator reconciliation required.'); }
      }
    }
  };
}
export function withRolloutGuard(handler: Handler, name: string, client = true): Handler {
  const rpc: Rpc = async (method, args) => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return { data: null, error: 'UNAVAILABLE' };
    const response = await fetch(`${url}/rest/v1/rpc/${method}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => null);
    return response.ok ? { data } : { data: null, error: data?.code ?? 'UNAVAILABLE' };
  };
  return guardedHandler(handler, name, client, rpc);
}
