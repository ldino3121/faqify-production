// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const invoke=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke}}}));
vi.mock('@/lib/rollout',()=>({requireRolloutOpen:vi.fn()}));

import { CheckoutRequestError, pendingPaddleCheckout } from '../src/lib/paddle';

describe('account checkout status response',()=>{
  it('accepts no customer and no intent as an empty eligible or ineligible status',async()=>{
    invoke.mockResolvedValueOnce({data:{pending:null,eligible:true},error:null});
    await expect(pendingPaddleCheckout()).resolves.toEqual({pending:null,eligible:true,result:undefined});
    invoke.mockResolvedValueOnce({data:{pending:null,eligible:false},error:null});
    await expect(pendingPaddleCheckout()).resolves.toEqual({pending:null,eligible:false,result:undefined});
  });
  it('keeps the valid pending intent available for resume',async()=>{
    const pending={pack:'Pro',status:'ready',transactionId:'txn_test',canResume:true,canCancel:true};
    invoke.mockResolvedValueOnce({data:{pending,eligible:true},error:null});
    await expect(pendingPaddleCheckout()).resolves.toMatchObject({pending});
  });
  it('distinguishes an expired session from provider/status failure and recovers on retry',async()=>{
    invoke.mockResolvedValueOnce({data:null,error:{context:{status:401,json:async()=>({error:'Please sign in.'})}}});
    await expect(pendingPaddleCheckout()).rejects.toMatchObject({status:401,message:'Please sign in.'});
    invoke.mockResolvedValueOnce({data:null,error:{context:{status:503,json:async()=>({error:'Unable to verify checkout status.'})}}});
    await expect(pendingPaddleCheckout()).rejects.toBeInstanceOf(CheckoutRequestError);
    invoke.mockResolvedValueOnce({data:{pending:null,eligible:true},error:null});
    await expect(pendingPaddleCheckout()).resolves.toMatchObject({pending:null,eligible:true});
  });
});
