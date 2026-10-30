import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, environment, json, paddleApi } from '../_shared/paddle.ts';
import { configuredCreditPackPrices, configuredPrices } from '../_shared/paddle-core.ts';
import { selectPortalLink } from '../_shared/portal-links.ts';

const transactionIdPattern = /^txn_[a-z0-9]{26}$/;
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const db = adminClient();
    const user = await authenticated(req, db);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    const sandbox = environment();
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'portal';
    if (action === 'transaction_status') {
      if (typeof body.transactionId !== 'string' || !transactionIdPattern.test(body.transactionId))
        return json({ error: 'Invalid transaction reference.' }, 400);
      const { data: checkout, error: checkoutError } = await db.from('paddle_checkouts')
        .select('id').eq('user_id', user.id).eq('environment', sandbox)
        .eq('transaction_id', body.transactionId).maybeSingle();
      if (checkoutError) throw checkoutError;
      if (!checkout) return json({ error: 'Transaction not found for this account.' }, 404);
      const transaction = await paddleApi(`/transactions/${body.transactionId}`);
      const { data: grant, error: grantError } = await db.from('faq_credit_grants')
        .select('credits').eq('user_id', user.id).eq('transaction_id', body.transactionId).maybeSingle();
      if (grantError) throw grantError;
      return json({ status: transaction.status, fulfilledCredits: grant?.credits ?? null });
    }
    const { data: customer, error: customerError } = await db.from('paddle_customers')
      .select('customer_id').eq('user_id', user.id).eq('environment', sandbox).maybeSingle();
    if (customerError) throw customerError;
    if (action === 'history' || action === 'recent_completed') {
      const recent = action === 'recent_completed';
      const after = body.after;
      if (recent && after !== undefined) return json({ error: 'Recent payments do not use a cursor.' }, 400);
      if (after !== undefined && (typeof after !== 'string' || !transactionIdPattern.test(after)))
        return json({ error: 'Invalid history cursor.' }, 400);
      const plans = [...configuredPrices(Deno.env.get), ...configuredCreditPackPrices(Deno.env.get)];
      const byPrice = new Map(plans.map(plan => [plan.priceId, plan]));
      // A summary never fetches the full history. Ten provider rows allow for
      // adjusted or unrelated transactions while keeping the request bounded.
      const pageSize = recent ? 10 : 20;
      let providerRows: any[] = [];
      if (customer) {
        const params = new URLSearchParams({ customer_id: customer.customer_id,
          per_page: String(pageSize), order_by: 'created_at[DESC]', include: 'adjustments' });
        if (recent) params.set('status', 'completed');
        if (after) params.set('after', after);
        const result = await paddleApi(`/transactions?${params}`);
        if (!Array.isArray(result)) throw new Error('Invalid Paddle transaction response');
        providerRows = result;
      }
      const providerCount = providerRows.length;
      // An open first checkout may not have a linked Paddle customer yet.
      if (!after && !recent) {
        const { data: open, error: openError } = await db.from('paddle_checkouts')
          .select('transaction_id').eq('user_id', user.id).eq('environment', sandbox)
          .eq('closed', false).not('transaction_id', 'is', null)
          .order('created_at', { ascending: false }).limit(10);
        if (openError) throw openError;
        const seen = new Set(providerRows.map(row => row.id));
        for (const intent of open ?? []) {
          if (intent.transaction_id && transactionIdPattern.test(intent.transaction_id) && !seen.has(intent.transaction_id)) {
            providerRows.push(await paddleApi(`/transactions/${intent.transaction_id}?include=adjustments`));
            seen.add(intent.transaction_id);
          }
        }
      }
      const ids = providerRows.map(row => row.id).filter((id: unknown): id is string =>
        typeof id === 'string' && transactionIdPattern.test(id));
      const { data: grants, error: grantError } = ids.length
        ? await db.from('faq_credit_grants').select('transaction_id,credits').eq('user_id', user.id).in('transaction_id', ids)
        : { data: [], error: null };
      if (grantError) throw grantError;
      const granted = new Map((grants ?? []).map(grant => [grant.transaction_id, grant.credits]));
      const { data: adjustments, error: adjustmentError } = ids.length
        ? await db.from('faq_credit_adjustments').select('transaction_id,resolution')
          .eq('user_id', user.id).in('transaction_id', ids)
        : { data: [], error: null };
      if (adjustmentError) throw adjustmentError;
      const reviews = new Set((adjustments ?? []).filter(item => item.resolution === 'review').map(item => item.transaction_id));
      const transactions = providerRows.map(transaction => {
        if (transaction.origin === 'subscription_payment_method_change') return null;
        const item = Array.isArray(transaction.items) && transaction.items.length === 1 ? transaction.items[0] : null;
        const plan = byPrice.get(item?.price?.id ?? item?.price_id);
        if (!plan || item?.quantity !== 1) return null;
        return { id: transaction.id, status: transaction.status, pack: plan.tier,
          kind: plan.kind, credits: plan.kind === 'credit_pack' ? plan.limit : null,
          fulfilledCredits: granted.get(transaction.id) ?? null,
          creditReview: reviews.has(transaction.id),
          amount: transaction.details?.totals?.total ?? null,
          currency: transaction.details?.totals?.currency_code ?? transaction.currency_code,
          createdAt: transaction.created_at, billedAt: transaction.billed_at,
          adjustments: (transaction.adjustments ?? []).map((adjustment: any) => ({
            action: adjustment.action, status: adjustment.status, type: adjustment.type,
          })) };
      }).filter(Boolean).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return json({ transactions, next: !recent && customer && providerCount === pageSize
        ? providerRows[pageSize - 1]?.id ?? null : null, hasCustomer: !!customer });
    }
    if (action !== 'portal' && action !== 'subscription') return json({ error: 'Unknown billing action.' }, 400);
    const { error: cohortError } = await db.rpc('faqify_require_sandbox_member', { p_user: user.id, p_environment: sandbox });
    if (cohortError) return json({ error: 'Sandbox billing is restricted to approved test accounts.' }, 403);
    if (!customer) return json({ error: 'No Paddle billing account found yet.' }, 404);
    let subscriptionId: string | null = null;
    if (action === 'subscription') {
      const { data: subscription, error: subscriptionError } = await db.from('user_subscriptions')
        .select('paddle_subscription_id,paddle_customer_id,subscription_source').eq('user_id', user.id).maybeSingle();
      if (subscriptionError) throw subscriptionError;
      if (subscription?.subscription_source !== 'paddle' || !subscription.paddle_subscription_id
        || subscription.paddle_customer_id !== customer.customer_id)
        return json({ error: 'No previous subscription found for this account.' }, 404);
      subscriptionId = subscription.paddle_subscription_id;
    }
    const session = await paddleApi(`/customers/${customer.customer_id}/portal-sessions`,
      subscriptionId ? { subscription_ids: [subscriptionId] } : {});
    // Portal URLs have temporary auth tokens and are returned only to this authenticated owner.
    return json({ url: selectPortalLink(session, action, subscriptionId) });
  } catch (error) {
    console.error('Billing request failed', error);
    return json({ error: 'Unable to load billing. Please retry or contact support.' }, 503);
  }
}, 'paddle-customer-portal', true));
