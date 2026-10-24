import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, environment, json, paddleApi } from '../_shared/paddle.ts';
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const db = adminClient();
    const user = await authenticated(req, db);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const { error: cohortError } = await db.rpc('faqify_require_sandbox_member', { p_user: user.id, p_environment: environment() });
    if (cohortError) return json({ error: 'Sandbox billing is restricted to approved test accounts.' }, 403);
    const { data, error } = await db.from('paddle_customers').select('customer_id').eq('user_id', user.id).eq('environment', environment()).single();
    if (error || !data) return json({ error: 'No Paddle billing account found yet.' }, 404);
    // The customer ID is always server-resolved, never supplied by the browser.
    const session = await paddleApi(`/customers/${data.customer_id}/portal-sessions`, {});
    return json({ url: session.urls.general.overview });
  } catch (error) {
    console.error('Portal setup failed', error);
    return json({ error: 'Unable to open billing. Please contact support.' }, 503);
  }
}, 'paddle-customer-portal', true));
