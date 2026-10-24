export interface Subscription {
  id: string; plan_tier: 'Free' | 'Pro' | 'Business'; status: string;
  faq_usage_current: number; faq_usage_limit: number;
  plan_activated_at: string | null; plan_expires_at: string | null;
  current_period_end: string | null; days_remaining: number;
  is_expired: boolean; expires_soon: boolean; auto_renewal: boolean;
  cancelled_at: string | null; cancellation_reason: string | null;
  payment_type: string; billing_cycle: string; subscription_source: string;
  is_cancelled: boolean; continues_until: string | null; next_billing_date: string | null;
  paddle_last_transaction_id?: string | null;
  paddle_subscription_id?: string | null; paddle_customer_id?: string | null;
  razorpay_subscription_id?: string | null;
  last_reset_date?: string; created_at?: string; updated_at?: string;
  is_annual?: boolean; previous_plan_tier?: string | null; plan_changed_at?: string;
}
export function normalizeSubscription(row: Record<string, any>, now = Date.now()): Subscription {
  const tier = row.plan_tier ?? row.plan_id ?? 'Free';
  const expires = row.plan_expires_at ?? row.expires_at ?? row.current_period_end ?? null;
  const expiresMs = expires ? Date.parse(expires) : NaN;
  const paid = tier !== 'Free';
  const expired = paid && (!Number.isFinite(expiresMs) || expiresMs <= now);
  const days = paid ? (Number.isFinite(expiresMs) ? Math.max(0, Math.ceil((expiresMs - now) / 86400000)) : 0) : Infinity;
  return { ...row, plan_tier: tier, status: row.status ?? 'active',
    faq_usage_current: Math.max(0, row.faq_usage_current ?? 0), faq_usage_limit: Math.max(0, row.faq_usage_limit ?? 0),
    plan_activated_at: row.plan_activated_at ?? row.activated_at ?? row.created_at ?? null,
    plan_expires_at: expires, current_period_end: row.current_period_end ?? expires,
    days_remaining: days, is_expired: expired, expires_soon: paid && days > 0 && days <= 7,
    auto_renewal: row.auto_renewal ?? false, cancelled_at: row.cancelled_at ?? null,
    cancellation_reason: row.cancellation_reason ?? null, payment_type: row.payment_type ?? 'one_time',
    next_billing_date: row.next_billing_date ?? null, billing_cycle: row.billing_cycle ?? 'monthly',
    subscription_source: row.subscription_source ?? 'manual', is_cancelled: !!row.cancelled_at,
    continues_until: row.cancelled_at ? expires : null,
  } as Subscription;
}
