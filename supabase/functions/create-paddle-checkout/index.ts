import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, environment, json, paddleApi } from '../_shared/paddle.ts';
import { configuredCreditPackPrices } from '../_shared/paddle-core.ts';
import { cancelVerifiedCheckout } from '../_shared/checkout-recovery.ts';

const transactionIdPattern = /^txn_[a-z0-9]{26}$/;
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = adminClient();
  let intentId: string | undefined;
  try {
    const user = await authenticated(req, db);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const env = environment();
    const { error: cohortError } = await db.rpc('faqify_require_sandbox_member', { p_user: user.id, p_environment: env });
    if (cohortError) return json({ error: 'Sandbox billing is restricted to approved test accounts.' }, 403);
    const { pack, action, transactionId } = await req.json().catch(() => ({}));
    const plans = configuredCreditPackPrices(Deno.env.get);
    async function closeCanceled(checkout: { id: string; transaction_id: string }) {
      const { error } = await db.from('paddle_checkouts').update({ closed: true, expires_at: new Date().toISOString() })
        .eq('id', checkout.id).eq('transaction_id', checkout.transaction_id).eq('user_id', user!.id).eq('closed', false);
      if (error) throw error;
    }
    async function closeFulfilled(checkout: { id: string; transaction_id: string }) {
      const { data: grant, error: grantError } = await db.from('faq_credit_grants').select('id')
        .eq('user_id', user!.id).eq('transaction_id', checkout.transaction_id).maybeSingle();
      if (grantError) throw grantError;
      if (!grant) return false;
      await closeCanceled(checkout);
      return true;
    }
    async function inspect(checkout: { id: string; transaction_id: string | null; price_id: string; tier: string; kind: string }) {
      if (!checkout.transaction_id) return { status: 'preparing', transaction: null };
      if (!transactionIdPattern.test(checkout.transaction_id)) throw new Error('Invalid transaction reference');
      const transaction = await paddleApi(`/transactions/${checkout.transaction_id}`);
      const plan = plans.find(item => item.priceId === checkout.price_id && item.tier === checkout.tier && item.kind === 'credit_pack');
      if (!plan || checkout.kind !== 'credit_pack' || transaction.id !== checkout.transaction_id ||
          transaction.custom_data?.faqify_checkout_id !== checkout.id ||
          transaction.custom_data?.faqify_user_id !== user!.id || transaction.subscription_id ||
          transaction.origin !== 'api' || transaction.collection_mode !== 'automatic' ||
          transaction.items?.length !== 1 || (transaction.items[0].price?.id ?? transaction.items[0].price_id) !== plan.priceId ||
          transaction.items[0].quantity !== 1) throw new Error('Checkout identity mismatch');
      if (transaction.status === 'canceled') await closeCanceled({ id: checkout.id, transaction_id: checkout.transaction_id });
      return { status: transaction.status as string, transaction };
    }
    async function reconcile(checkout: { id: string; transaction_id: string; price_id: string; tier: string }, transaction: any) {
      if (transaction.status !== 'completed') return false;
      const { data: grant, error: grantError } = await db.from('faq_credit_grants').select('id')
        .eq('user_id', user!.id).eq('transaction_id', checkout.transaction_id).maybeSingle();
      if (grantError) throw grantError;
      if (grant) return await closeFulfilled(checkout);
      // Reuse Paddle's real completed event and the webhook's idempotent SQL path.
      const events = await paddleApi(`/events?event_type=transaction.completed&filter=${checkout.transaction_id}&per_page=20`);
      const event = Array.isArray(events) ? events.find(item => item.event_type === 'transaction.completed' &&
        item.data?.id === checkout.transaction_id && item.data?.status === 'completed') : null;
      if (!event) return false;
      const data = event.data;
      if (!/^evt_[a-z0-9]{26}$/.test(event.event_id) || !Number.isFinite(Date.parse(event.occurred_at)) ||
          data.custom_data?.faqify_checkout_id !== checkout.id || data.custom_data?.faqify_user_id !== user!.id ||
          data.items?.length !== 1 || (data.items[0].price?.id ?? data.items[0].price_id) !== checkout.price_id ||
          data.items[0].quantity !== 1 || data.subscription_id || data.currency_code !== 'USD')
        throw new Error('Completed payment identity mismatch');
      const plan = plans.find(item => item.priceId === checkout.price_id && item.tier === checkout.tier);
      if (!plan) throw new Error('Credit pack configuration mismatch');
      const { error } = await db.rpc('apply_paddle_credit_event', {
        p_event_id: event.event_id, p_occurred_at: event.occurred_at, p_environment: env,
        p_payload: { operation: 'payment', transaction_id: data.id, subscription_id: null,
          customer_id: data.customer_id, checkout_id: checkout.id, user_id: user!.id,
          price_id: plan.priceId, tier: plan.tier, kind: plan.kind, limit: plan.limit,
          period_end: null, period_start: event.occurred_at,
          amount: data.details?.totals?.total, currency: data.currency_code },
      });
      if (error) throw error;
      return await closeFulfilled(checkout);
    }
    if (action === 'pending' || action === 'resume' || action === 'cancel_pending') {
      // A setup failure may leave an intent without a Paddle transaction.
      // Only those expired, transaction-less intents may be released locally.
      const { error: staleError } = await db.from('paddle_checkouts').update({ closed: true })
        .eq('user_id', user.id).eq('environment', env).eq('closed', false)
        .is('transaction_id', null).lte('expires_at', new Date().toISOString());
      if (staleError) throw staleError;
      const { data: pending, error } = await db.from('paddle_checkouts')
        .select('id,transaction_id,price_id,tier,kind').eq('user_id', user.id).eq('environment', env)
        .eq('closed', false).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!pending) return json({ pending: null });
      if (action !== 'pending' && pending.transaction_id !== transactionId)
        return json({ error: 'Checkout changed in another tab. Refresh and try again.' }, 409);
      const { status, transaction } = await inspect(pending);
      if (status === 'canceled') return json({ pending: null, result: 'canceled' });
      if (status === 'completed') {
        try {
          if (await reconcile(pending as typeof pending & { transaction_id: string }, transaction))
            return json({ pending: null, result: 'fulfilled' });
        } catch (error) { console.error('Checkout reconciliation failed', error instanceof Error ? error.message : 'unknown'); }
        return json({ pending: { pack: pending.tier, status: 'processing' } });
      }
      if (status === 'paid') return json({ pending: { pack: pending.tier, status: 'processing' } });
      if (action === 'pending') return json({ pending: { pack: pending.tier, status,
        transactionId: pending.transaction_id, canResume: status === 'draft' || status === 'ready',
        canCancel: status === 'draft' || status === 'ready' } });
      if (action === 'resume') {
        if (status !== 'draft' && status !== 'ready') return json({ error: 'This checkout cannot be resumed. Refresh its status.' }, 409);
        return json({ transactionId: pending.transaction_id });
      }
      const result = await cancelVerifiedCheckout(status,
        () => paddleApi(`/transactions/${pending.transaction_id}`, { status: 'canceled' }, 'PATCH'),
        async () => (await paddleApi(`/transactions/${pending.transaction_id}`)).status,
        () => closeCanceled(pending as typeof pending & { transaction_id: string }));
      if (result !== 'canceled')
        return json({ error: 'This checkout is processing or cannot be canceled. Refresh its status.' }, 409);
      return json({ pending: null, result: 'canceled' });
    }
    if (pack !== 'Pro' && pack !== 'Business') return json({ error: 'Refresh FAQify to buy a credit pack.' }, 400);
    const plan = plans.find(item => item.tier === pack);
    if (!plan) return json({ error: 'This credit pack has not been configured.' }, 503);
    const { data: intent, error } = await db.rpc('begin_paddle_credit_checkout', { p_user: user.id, p_pack: pack, p_environment: env });
    if (error) return json({ error: error.message }, 409);
    if (intent.price_id !== plan.priceId) throw new Error('Credit price configuration mismatch');
    intentId = intent.id;
    if (intent.transaction_id) {
      const { status, transaction } = await inspect({ id: intent.id, transaction_id: intent.transaction_id,
        price_id: intent.price_id, tier: pack, kind: 'credit_pack' });
      if (status === 'draft' || status === 'ready') return json({ transactionId: transaction.id });
      return json({ error: 'Your earlier checkout changed. Refresh its status before buying again.' }, 409);
    }
    if (!intent.is_new) return json({ error: 'A checkout is being prepared. Please try again shortly.' }, 409);
    const { data: customer } = await db.from('paddle_customers').select('customer_id').eq('user_id', user.id).eq('environment', env).maybeSingle();
    const transaction = await paddleApi('/transactions', {
      items: [{ price_id: plan.priceId, quantity: 1 }], collection_mode: 'automatic',
      ...(customer ? { customer_id: customer.customer_id } : {}),
      custom_data: { faqify_checkout_id: intent.id, faqify_user_id: user.id },
    });
    const { error: storeError } = await db.from('paddle_checkouts').update({ transaction_id: transaction.id }).eq('id', intent.id);
    if (storeError) throw storeError;
    return json({ transactionId: transaction.id });
  } catch (error) {
    if (intentId) await db.from('paddle_checkouts').update({ expires_at: new Date().toISOString() }).eq('id', intentId).is('transaction_id', null);
    console.error('Checkout recovery failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Unable to verify checkout status. Please retry or contact support.' }, 503);
  }
}, 'create-paddle-checkout', true));
