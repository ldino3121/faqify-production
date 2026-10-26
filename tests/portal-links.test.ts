import { describe, expect, it } from 'vitest';
import { selectPortalLink } from '../supabase/functions/_shared/portal-links';

const overview = 'https://sandbox-customer-portal.paddle.com/portal?action=overview&token=temporary';
const subscription = 'https://sandbox-customer-portal.paddle.com/portal?action=view_subscription&token=temporary';
const session = { urls: { general: { overview }, subscriptions: [
  { id: 'sub_owned', view_subscription: subscription },
] } };

describe('account-owned Paddle portal URL selection', () => {
  it('selects the documented overview for billing history', () => {
    expect(selectPortalLink(session, 'portal', null)).toBe(overview);
  });
  it('selects the exact subscription deep link', () => {
    expect(selectPortalLink(session, 'subscription', 'sub_owned')).toBe(subscription);
  });
  it('never silently falls back to overview for an absent or incomplete subscription link', () => {
    expect(() => selectPortalLink(session, 'subscription', 'sub_other')).toThrow('Paddle portal link unavailable');
    expect(() => selectPortalLink({ urls: { general: { overview }, subscriptions: [{ id: 'sub_owned' }] } },
      'subscription', 'sub_owned')).toThrow('Paddle portal link unavailable');
  });
  it('rejects an incomplete or non-HTTPS link', () => {
    expect(() => selectPortalLink({ urls: { general: { overview: 'http://example.com' } } }, 'portal', null))
      .toThrow('Paddle portal link unavailable');
  });
});
