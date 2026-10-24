import { describe, expect, it } from 'vitest';
import { normalizeSubscription } from './subscription';
describe('subscription normalization',()=>{
  it('keeps Free permanent and refuses to invent a paid expiry',()=>{
    expect(normalizeSubscription({plan_tier:'Free'}).is_expired).toBe(false);
    expect(normalizeSubscription({plan_tier:'Pro',plan_activated_at:'2026-01-01'}).is_expired).toBe(true);
  });
  it('preserves Paddle source and cancellation fields without treating scheduled cancellation as expired',()=>{
    const row=normalizeSubscription({plan_tier:'Pro',subscription_source:'paddle',paddle_subscription_id:'sub-test',cancelled_at:'2026-10-01',plan_expires_at:'2099-10-01'});
    expect(row.subscription_source).toBe('paddle');expect(row.is_cancelled).toBe(true);expect(row.is_expired).toBe(false);
  });
});
