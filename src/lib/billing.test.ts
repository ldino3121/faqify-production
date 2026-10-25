import { describe, expect, it } from 'vitest';
import { legacyAllowance, legacyAllowanceMessage, manageablePreviousSubscription, paymentCategory, paymentStatusText,
  type PaymentSummary } from './billing';
import type { CreditBalance } from '@/hooks/useCredits';
import type { Subscription } from './subscription';
import { intendedDashboard, purchaseIntent } from './purchase-intent';

const balance: CreditBalance = { free: 0, paid: 700, legacy: 92, reserved: 0,
  available: 792, introState: 'review', everPurchased: true, hold: false };
const subscription = { plan_tier: 'Pro', status: 'active', paddle_subscription_id: 'sub_test',
  plan_expires_at: '2026-11-25T06:59:10Z' } as Subscription;
const purchase: PaymentSummary = { id: 'txn_test', status: 'completed', pack: 'Pro', kind: 'credit_pack',
  credits: 100, fulfilledCredits: 100, amount: '1062', currency: 'USD',
  createdAt: '2026-10-25T14:00:00Z', billedAt: '2026-10-25T14:01:00Z', adjustments: [] };

describe('credit billing presentation', () => {
  it('keeps temporary allowance separate and hides it after expiry or exhaustion', () => {
    expect(legacyAllowance(balance, subscription, Date.parse('2026-10-26'))?.remaining).toBe(92);
    expect(legacyAllowance(balance, subscription, Date.parse('2026-11-26'))).toBeNull();
    expect(legacyAllowance({ ...balance, legacy: 0 }, subscription, Date.parse('2026-10-26'))).toBeNull();
    expect(legacyAllowance({ ...balance, legacy: 0 }, null)).toBeNull();
    expect(manageablePreviousSubscription(subscription, Date.parse('2026-10-26'))).toBe(true);
    expect(manageablePreviousSubscription(null)).toBe(false);
    expect(legacyAllowanceMessage({ ...subscription, auto_renewal: false, cancelled_at: '2026-10-25' }, subscription.plan_expires_at!))
      .toContain('Your previous subscription allowance ends');
    expect(legacyAllowanceMessage({ ...subscription, auto_renewal: true, cancelled_at: null }, subscription.plan_expires_at!))
      .toContain('A renewal may provide a new period');
  });
  it('does not mistake a checkout callback or completed payment for a fulfilled grant', () => {
    expect(paymentCategory({ ...purchase, fulfilledCredits: null })).toBe('pending');
    expect(paymentStatusText({ ...purchase, fulfilledCredits: null })).toContain('being confirmed');
    expect(paymentCategory(purchase)).toBe('completed');
    expect(paymentCategory({ ...purchase, status: 'past_due', fulfilledCredits: null })).toBe('failed');
  });
  it('separates refunds and disputes from fulfilled purchase status', () => {
    expect(paymentCategory({ ...purchase, adjustments: [{ action: 'refund', status: 'approved', type: 'full' }] })).toBe('refunded');
    expect(paymentCategory({ ...purchase, adjustments: [{ action: 'refund', status: 'pending_approval', type: 'partial' }] })).toBe('review');
    expect(paymentCategory({ ...purchase, adjustments: [{ action: 'chargeback', status: 'approved', type: 'full' }] })).toBe('disputed');
  });
  it('accepts only known pack purchase intents after authentication', () => {
    expect(purchaseIntent('?purchase=Business')).toBe('Business');
    expect(purchaseIntent('?purchase=AnythingElse')).toBeNull();
    expect(intendedDashboard('Pro')).toBe('/dashboard?purchase=Pro');
  });
});
