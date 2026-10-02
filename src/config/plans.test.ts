import { describe, it, expect } from 'vitest';
import { PLANS, planByTier, FREE_FAQ_LIMIT } from './plans';

describe('pricing plans (single source of truth)', () => {
  it('exposes canonical FAQ limits', () => {
    expect(planByTier('Free').faqLimit).toBe(5);
    expect(planByTier('Pro').faqLimit).toBe(100);
    expect(planByTier('Business').faqLimit).toBe(500);
  });

  it('exposes canonical prices (USD cents)', () => {
    expect(planByTier('Free').priceMonthlyCents).toBe(0);
    expect(planByTier('Pro').priceMonthlyCents).toBe(900);
    expect(planByTier('Business').priceMonthlyCents).toBe(2900);
  });

  it('FREE_FAQ_LIMIT matches the Free tier', () => {
    expect(FREE_FAQ_LIMIT).toBe(5);
  });

  it('has exactly three tiers', () => {
    expect(PLANS.map((p) => p.tier)).toEqual(['Free', 'Pro', 'Business']);
  });
});
