import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, environment, json } from '../_shared/paddle.ts';
import { configuredCreditPackPrices, configuredPrices, resolvePrice, verifyPaddleSignature } from '../_shared/paddle-core.ts';
Deno.serve(withRolloutGuard(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
    if (!secret) throw new Error('Webhook secret is not configured');
    const raw = await req.text();
    if (!await verifyPaddleSignature(raw, req.headers.get('Paddle-Signature') ?? '', secret)) return json({ error: 'Invalid signature' }, 401);
    const event = JSON.parse(raw);
    if (!/^evt_[a-z0-9]{26}$/.test(event.event_id ?? '') || !Number.isFinite(Date.parse(event.occurred_at))) return json({ error: 'Invalid event' }, 400);
    const data = event.data;
    let payload: Record<string, unknown>;
    let creditPack = false;
    const db = adminClient();
    if (event.event_type === 'transaction.completed') {
      if (data.status !== 'completed') return json({ ignored: true });
      const plan = resolvePrice(data.items, [
        ...configuredPrices(Deno.env.get), ...configuredCreditPackPrices(Deno.env.get),
      ]);
      creditPack = plan.kind === 'credit_pack';
      if ((plan.kind === 'recurring') !== !!data.subscription_id) throw new Error('Transaction billing type mismatch');
      const end = plan.kind === 'recurring' ? data.billing_period?.ends_at
        : plan.kind === 'one_time' ? new Date(Date.parse(event.occurred_at) + 30 * 86400000).toISOString() : null;
      if (!creditPack && (!end || !Number.isFinite(Date.parse(end)))) throw new Error('Missing billing period');
      payload = { operation: 'payment', transaction_id: data.id, subscription_id: data.subscription_id ?? null,
        customer_id: data.customer_id, checkout_id: data.custom_data?.faqify_checkout_id ?? null,
        user_id: data.custom_data?.faqify_user_id ?? null,
        price_id: plan.priceId, tier: plan.tier, kind: plan.kind, limit: plan.limit, period_end: end,
        period_start: data.billing_period?.starts_at ?? event.occurred_at,
        amount: data.details?.totals?.total, currency: data.currency_code };
    } else if (event.event_type.startsWith('subscription.')) {
      // Lifecycle notifications never grant quota or extend paid access. Only a completed payment does.
      payload = { operation: 'subscription', subscription_id: data.id, customer_id: data.customer_id,
        status: data.status, scheduled_action: data.scheduled_change?.action ?? null,
        canceled_at: data.canceled_at ?? null };
    } else if (event.event_type === 'adjustment.created' || event.event_type === 'adjustment.updated') {
      payload = { operation: 'adjustment', transaction_id: data.transaction_id, action: data.action,
        adjustment_id: data.id, customer_id: data.customer_id,
        adjustment_status: data.status, adjustment_type: data.type };
      const { data: purchase, error: purchaseError } = await db.from('faq_credit_grants')
        .select('id').eq('transaction_id', data.transaction_id).maybeSingle();
      if (purchaseError) throw purchaseError;
      if (purchase) creditPack = true;
      else {
        const { data: checkout, error: checkoutError } = await db.from('paddle_checkouts')
          .select('kind').eq('transaction_id', data.transaction_id).maybeSingle();
        if (checkoutError) throw checkoutError;
        creditPack = checkout?.kind === 'credit_pack';
      }
    } else return json({ ignored: true });
    const { error, data: result } = await db.rpc(creditPack ? 'apply_paddle_credit_event' : 'apply_paddle_event', {
      p_event_id: event.event_id, p_occurred_at: event.occurred_at, p_environment: environment(), p_payload: payload,
    });
    if (error) throw error;
    return json({ received: true, result });
  } catch (error) {
    // Non-2xx makes Paddle retry; no event is acknowledged before its DB transaction commits.
    console.error('Paddle webhook processing failed', error);
    return json({ error: 'Webhook processing failed' }, 500);
  }
}, 'paddle-webhook', false));
