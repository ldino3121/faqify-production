// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { cancelVerifiedCheckout } from '../supabase/functions/_shared/checkout-recovery';

describe('unfinished Paddle checkout cancellation', () => {
  it.each(['draft', 'ready'])('releases a %s intent only after a canceled read-back', async status => {
    const order: string[] = [];
    const result = await cancelVerifiedCheckout(status,
      async () => { order.push('patch'); },
      async () => { order.push('get'); return 'canceled'; },
      async () => { order.push('close'); });
    expect(result).toBe('canceled');
    expect(order).toEqual(['patch', 'get', 'close']);
  });
  it.each(['paid', 'completed', 'past_due', 'billed', 'preparing'])('keeps a %s intent locked', async status => {
    const patch = vi.fn(); const get = vi.fn(); const close = vi.fn();
    expect(await cancelVerifiedCheckout(status, patch, get, close)).toBe('not_cancellable');
    expect(patch).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('does not release a lock if payment completes during cancellation', async () => {
    const close = vi.fn();
    await expect(cancelVerifiedCheckout('ready', async () => { throw new Error('status changed'); },
      async () => 'completed', close)).rejects.toThrow('status changed');
    expect(close).not.toHaveBeenCalled();
  });
  it('does not release a lock after a failed or uncertain read-back', async () => {
    const close = vi.fn();
    await expect(cancelVerifiedCheckout('ready', async () => {}, async () => 'paid', close))
      .rejects.toThrow('Cancellation could not be confirmed');
    await expect(cancelVerifiedCheckout('ready', async () => {}, async () => { throw new Error('network'); }, close))
      .rejects.toThrow('network');
    expect(close).not.toHaveBeenCalled();
  });
  it('recovers a remotely canceled checkout after a lost response', async () => {
    const patch = vi.fn(); const get = vi.fn(); const close = vi.fn();
    expect(await cancelVerifiedCheckout('canceled', patch, get, close)).toBe('canceled');
    expect(patch).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
