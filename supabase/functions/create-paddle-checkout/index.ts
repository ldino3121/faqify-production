import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, environment, json, paddleApi } from '../_shared/paddle.ts';
import { configuredPrices } from '../_shared/paddle-core.ts';
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = adminClient();
  let intentId: string | undefined;
  try {
    const user = await authenticated(req, db);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const { error: cohortError } = await db.rpc('faqify_require_sandbox_member', { p_user: user.id, p_environment: environment() });
    if (cohortError) return json({ error: 'Sandbox billing is restricted to approved test accounts.' }, 403);
    const { tier, kind, action, transactionId } = await req.json();
    if (action === 'resume') {
      if (!/^txn_[a-z0-9]{26}$/.test(transactionId ?? '')) return json({ error: 'Invalid checkout link.' }, 400);
      const { data: owned, error } = await db.from('paddle_checkouts').select('transaction_id')
        .eq('transaction_id', transactionId).eq('user_id', user.id).eq('environment', environment()).eq('closed', false).maybeSingle();
      if (error || !owned) return json({ error: 'Sign in with the approved account that opened this checkout.' }, 403);
      return json({ transactionId: owned.transaction_id });
    }
    if (action === 'cancel_pending') {
      const { data: pending } = await db.from('paddle_checkouts').select('id,transaction_id')
        .eq('user_id', user.id).eq('environment', environment()).eq('closed', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!pending) return json({ success: true });
      if (!pending.transaction_id) return json({ error: 'Checkout is still being prepared. Please retry shortly.' }, 409);
      const transaction = await paddleApi(`/transactions/${pending.transaction_id}`);
      if (!['draft','ready','canceled'].includes(transaction.status)) return json({ error: 'This transaction is processing or paid. Wait for the account update or contact support.' }, 409);
      if (transaction.status !== 'canceled') await paddleApi(`/transactions/${pending.transaction_id}`, { status: 'canceled' }, 'PATCH');
      const { error } = await db.from('paddle_checkouts').update({ closed: true }).eq('id', pending.id);
      if (error) throw error;
      return json({ success: true });
    }
    const plan = configuredPrices(Deno.env.get).find(p => p.tier === tier && p.kind === kind);
    if (!plan) return json({ error: 'This payment option has not been configured.' }, 400);
    const env = environment();
    // SQL locks the account and reuses an unexpired intent, preventing parallel checkouts.
    const { data: intent, error } = await db.rpc('begin_paddle_checkout', { p_user: user.id, p_tier: tier, p_kind: kind, p_price: plan.priceId, p_environment: env });
    if (error) return json({ error: error.message }, 409);
    intentId = intent.id;
    if (intent.transaction_id) return json({ transactionId: intent.transaction_id });
    if (!intent.is_new) return json({ error: 'A checkout is being prepared. Please try again shortly.' }, 409);
    const { data: customer } = await db.from('paddle_customers').select('customer_id').eq('user_id', user.id).eq('environment', env).maybeSingle();
    const transaction = await paddleApi('/transactions', {
      items: [{ price_id: plan.priceId, quantity: 1 }],
      collection_mode: 'automatic',
      ...(customer ? { customer_id: customer.customer_id } : {}),
      custom_data: { faqify_checkout_id: intent.id, faqify_user_id: user.id },
    });
    const { error: storeError } = await db.from('paddle_checkouts').update({ transaction_id: transaction.id }).eq('id', intent.id);
    if (storeError) throw storeError;
    return json({ transactionId: transaction.id });
  } catch (error) {
    // A failed setup is retryable; successful checkouts are never discarded here.
    if (intentId) await db.from('paddle_checkouts').update({ expires_at: new Date().toISOString() }).eq('id', intentId).is('transaction_id', null);
    console.error('Checkout setup failed', error);
    return json({ error: 'Unable to prepare checkout. Please retry or contact support.' }, 503);
  }
}, 'create-paddle-checkout', true));
