// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({userId:null as string|null,authLoading:false}));
const pending=vi.hoisted(()=>vi.fn());
const toast=vi.hoisted(()=>vi.fn());
const refetch=vi.hoisted(()=>vi.fn(async()=>{}));
const stableToast=vi.hoisted(()=>({toast}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:state.userId?{id:state.userId,email:'test@example.invalid'}:null,loading:state.authLoading})}));
vi.mock('@/hooks/useCredits',()=>({useCredits:()=>({balance:{available:5,paid:0,free:5,legacy:0,reserved:0},refetch})}));
vi.mock('@/hooks/useSubscription',()=>({useSubscription:()=>({subscription:null})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>stableToast}));
vi.mock('@/lib/paddle',()=>({PADDLE_READY:true,pendingPaddleCheckout:pending,CheckoutRequestError:class extends Error {constructor(message:string,public status:number){super(message);}},
  openPaddleCheckout:vi.fn(),closePendingPaddleCheckout:vi.fn(),resumePaddleCheckout:vi.fn()}));
vi.mock('@/components/dashboard/PaddleBilling',()=>({PaddleBilling:()=>null}));

import { BillingPlans } from './BillingPlans';
import { CheckoutRequestError } from '@/lib/paddle';

const flush=async()=>{await act(async()=>{await Promise.resolve();await Promise.resolve();});};
describe('Buy Credits account-scoped status',()=>{
  let node:HTMLDivElement;
  let root:ReturnType<typeof createRoot>;
  beforeEach(()=>{
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    state.userId=null;state.authLoading=false;pending.mockReset();toast.mockReset();
    node=document.createElement('div');document.body.appendChild(node);root=createRoot(node);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  });
  afterEach(async()=>{await act(async()=>root.unmount());node.remove();});
  const render=async()=>act(async()=>root.render(<MemoryRouter><BillingPlans dashboard onNavigateToOverview={()=>{}} usageLimitsOpen={false} onUsageLimitsChange={()=>{}}/></MemoryRouter>));
  it('waits for auth readiness and treats a new account without an intent as empty',async()=>{
    state.authLoading=true;
    await render();
    expect(pending).not.toHaveBeenCalled();
    state.authLoading=false;state.userId='account-a';pending.mockResolvedValue({pending:null,eligible:true});
    await render();await flush();
    expect(pending).toHaveBeenCalledOnce();
    expect(node.textContent).not.toContain('Retry status check');
    expect(node.textContent).not.toContain('Sandbox purchases are limited');
  });
  it('shows test eligibility without a false Paddle outage and blocks purchase buttons',async()=>{
    state.userId='account-a';pending.mockResolvedValue({pending:null,eligible:false});
    await render();await flush();
    expect(node.textContent).toContain('Sandbox purchases are limited to approved test accounts');
    expect(node.textContent).not.toContain('Retry status check');
    expect([...node.querySelectorAll('button')].filter(button=>button.textContent?.startsWith('Buy ') && button.disabled)).toHaveLength(2);
  });
  it('ignores a stale pending checkout response after switching accounts',async()=>{
    let resolveA:(value:unknown)=>void=()=>{};
    pending.mockImplementationOnce(()=>new Promise(resolve=>{resolveA=resolve;}))
      .mockResolvedValueOnce({pending:null,eligible:false});
    state.userId='account-a';await render();
    state.userId='account-b';await render();await flush();
    resolveA({pending:{pack:'Pro',status:'ready',transactionId:'txn_old',canResume:true},eligible:true});
    await flush();
    expect(node.textContent).not.toContain('Pro checkout is unfinished');
    expect(node.textContent).toContain('Sandbox purchases are limited to approved test accounts');
  });
  it('preserves a valid checkout during a status failure and clears retry after success',async()=>{
    state.userId='account-a';pending.mockResolvedValueOnce({pending:{pack:'Pro',status:'ready',transactionId:'txn_test',canResume:true,canCancel:true},eligible:true})
      .mockRejectedValueOnce(new Error('temporary network outage'))
      .mockResolvedValue({pending:{pack:'Pro',status:'ready',transactionId:'txn_test',canResume:true,canCancel:true},eligible:true});
    await render();await flush();
    expect(node.textContent).toContain('Resume checkout');
    await act(async()=>{window.dispatchEvent(new Event('focus'));});await flush();
    expect(node.textContent).toContain('Retry status check');
    expect(node.textContent).toContain('Resume checkout');
    const retry=[...node.querySelectorAll('button')].find(button=>button.textContent?.includes('Retry status check'));
    await act(async()=>{retry?.click();});await flush();
    expect(node.textContent).not.toContain('Retry status check');
    expect(node.textContent).toContain('Resume checkout');
  });
  it('labels an expired session instead of a Paddle outage',async()=>{
    state.userId='account-a';
    pending.mockRejectedValue(new CheckoutRequestError('expired',401));
    await render();await flush();
    expect(node.textContent).toContain('Your session expired');
    expect(node.querySelector('[role="alert"]')?.textContent).not.toContain('Paddle');
  });
});
