import type { CreditBalance } from '@/hooks/useCredits';
import type { Subscription } from '@/lib/subscription';

export interface PaymentSummary {
  id: string;
  status: string;
  pack: 'Pro' | 'Business';
  kind: 'credit_pack' | 'recurring' | 'one_time';
  credits: number | null;
  fulfilledCredits: number | null;
  amount: string | null;
  currency: string;
  createdAt: string;
  billedAt: string | null;
  adjustments: Array<{ action: string; status: string; type: string | null }>;
}

export function legacyAllowance(balance: CreditBalance | null, subscription: Subscription | null, now = Date.now()) {
  const expiry = subscription?.plan_expires_at;
  if (!balance?.legacy || !expiry || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now)
    return null;
  if (subscription?.plan_tier === 'Free' || !['active', 'cancelled', 'canceled'].includes(subscription?.status ?? ''))
    return null;
  return { remaining: balance.legacy, expiresAt: expiry };
}

export function manageablePreviousSubscription(subscription: Subscription | null, now = Date.now()) {
  return !!subscription?.paddle_subscription_id && !!subscription.plan_expires_at
    && Date.parse(subscription.plan_expires_at) > now
    && ['active', 'cancelled', 'canceled', 'paused', 'past_due'].includes(subscription.status);
}

export function legacyAllowanceMessage(subscription: Subscription, expiresAt: string) {
  const end = localDate(expiresAt);
  return subscription.auto_renewal && !subscription.cancelled_at && subscription.status === 'active'
    ? `Your current previous subscription allowance runs through ${end}. A renewal may provide a new period. Purchased credits do not expire.`
    : `Your previous subscription allowance ends ${end}. Purchased credits do not expire.`;
}

export type PaymentCategory = 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed' | 'review';
export function paymentCategory(payment: PaymentSummary): PaymentCategory {
  if (payment.adjustments.some(item => item.action === 'chargeback_reverse' && item.status !== 'rejected')) return 'review';
  const adjustment = payment.adjustments.find(item =>
    ['refund', 'chargeback', 'chargeback_reverse'].includes(item.action) && item.status !== 'rejected');
  if (adjustment?.action === 'chargeback') return adjustment.status === 'approved' ? 'disputed' : 'review';
  if (adjustment?.action === 'refund') return adjustment.status === 'approved' ? 'refunded' : 'review';
  if (adjustment) return 'review';
  if (payment.status === 'canceled' || payment.status === 'past_due') return 'failed';
  if (payment.status === 'completed') return payment.fulfilledCredits != null || payment.kind !== 'credit_pack' ? 'completed' : 'pending';
  return 'pending';
}

export function paymentStatusText(payment: PaymentSummary) {
  const category = paymentCategory(payment);
  if (category === 'completed') return payment.kind === 'credit_pack' ? 'Completed · credits added' : 'Completed';
  if (category === 'pending' && payment.status === 'completed') return 'Payment received · credits being confirmed';
  if (category === 'pending' && payment.status === 'paid') return 'Payment received · processing';
  if (category === 'pending') return 'Payment pending';
  if (category === 'failed') return 'Payment failed or canceled';
  if (category === 'refunded') return 'Refunded';
  if (category === 'disputed') return 'Disputed';
  return 'Billing adjustment under review';
}

export function formatPaymentAmount(amount: string | null, currency: string) {
  if (amount === null || !/^-?\d+$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) return 'Amount calculated at checkout';
  const divisor = ['JPY', 'KRW', 'VND', 'CLP'].includes(currency) ? 1 : 100;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) / divisor); }
  catch { return `${amount} ${currency}`; }
}

export function localDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time) : 'Date unavailable';
}
