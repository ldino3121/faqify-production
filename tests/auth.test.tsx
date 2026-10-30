import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ listener: null as any, resolve: null as any, signUp: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{
  onAuthStateChange: (callback: any) => { state.listener=callback; return {data:{subscription:{unsubscribe:state.unsubscribe}}}; },
  getSession: () => new Promise(resolve=>{state.resolve=resolve;}),
  signUp: state.signUp,
}}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
let root: Root;let container: HTMLDivElement;let auth: ReturnType<typeof useAuth>;
let queryClient: QueryClient;
function Capture(){auth=useAuth();return <span>{auth.user?.email ?? 'signed-out'}</span>;}
async function mount(){
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  queryClient = new QueryClient();
  await act(async()=>{root.render(<QueryClientProvider client={queryClient}><AuthProvider><Capture /></AuthProvider></QueryClientProvider>);});
}
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();vi.clearAllMocks();});
describe('authentication transitions',()=>{
  it('updates state immediately and refuses to overwrite a newer auth event with a stale session load',async()=>{
    await mount();
    await act(async()=>{state.listener('SIGNED_IN',{user:{id:'u1',email:'test@example.com'}});});
    expect(auth.user?.id).toBe('u1');expect(auth.loading).toBe(false);
    await act(async()=>{state.resolve({data:{session:null},error:null});});
    expect(auth.user?.id).toBe('u1');
    queryClient.setQueryData(['faq-collections','u1'], [{ title: 'private' }]);
    await act(async()=>{state.listener('SIGNED_OUT',null);});
    expect(auth.user).toBe(null);
    expect(queryClient.getQueryData(['faq-collections','u1'])).toBeUndefined();
  });
  it('accepts sessionless email signup as confirmation-required, not an existing-account error',async()=>{
    await mount();state.signUp.mockResolvedValue({data:{user:{id:'new'},session:null},error:null});
    expect(await auth.signUp('new@example.com','TestPassword123','New User')).toEqual({confirmationRequired:true});
  });
  it('recognizes signup with an immediate session',async()=>{
    await mount();state.signUp.mockResolvedValue({data:{user:{id:'new'},session:{user:{id:'new'}}},error:null});
    expect(await auth.signUp('new@example.com','TestPassword123')).toEqual({confirmationRequired:false});
  });
});
