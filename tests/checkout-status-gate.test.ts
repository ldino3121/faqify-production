// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { checkoutStatusGate } from '../supabase/functions/_shared/checkout-status-gate';

describe('checkout status gate',()=>{
  it('returns a successful empty status for an eligible new account without an intent',async()=>{
    const eligible=vi.fn(async()=>true);
    await expect(checkoutStatusGate('pending',false,eligible)).resolves.toEqual({body:{pending:null,eligible:true},status:200});
    expect(eligible).toHaveBeenCalledOnce();
  });
  it('returns an empty status and explicit test eligibility for a non-cohort new account',async()=>{
    await expect(checkoutStatusGate('pending',false,async()=>false)).resolves.toEqual({body:{pending:null,eligible:false},status:200});
  });
  it('does not reinterpret an existing unpaid checkout as an empty state',async()=>{
    await expect(checkoutStatusGate('pending',true,async()=>true)).resolves.toBeNull();
  });
  it('keeps an existing intent protected when the account loses cohort eligibility',async()=>{
    await expect(checkoutStatusGate('pending',true,async()=>false)).resolves.toMatchObject({status:403});
  });
  it('does not turn a real eligibility-service failure into an empty success',async()=>{
    await expect(checkoutStatusGate('pending',false,async()=>{throw new Error('database unavailable');})).rejects.toThrow('database unavailable');
  });
});
