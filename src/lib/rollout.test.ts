import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIENT_REVISION, refreshRollout, requireRolloutOpen, rolloutFetch, rolloutSnapshot } from './rollout';
const fetchMock=vi.fn();
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
it('fails closed on unavailable or missing configuration and accepts only an open compatible revision',async()=>{
  fetchMock.mockResolvedValue(new Response('{}',{status:404}));
  await expect(requireRolloutOpen()).rejects.toThrow('Maintenance');
  fetchMock.mockImplementation(async()=>new Response(JSON.stringify({mode:'open',minimum_client_revision:1})));
  await expect(requireRolloutOpen()).resolves.toBeUndefined();
  fetchMock.mockImplementation(async()=>new Response(JSON.stringify({mode:'open',minimum_client_revision:2})));
  await expect(requireRolloutOpen()).rejects.toThrow('Export unsaved');
});
it('adds the compatibility header to guarded functions and database calls without forwarding it elsewhere',async()=>{
  fetchMock.mockImplementation(async()=>new Response('{}'));
  for(const [url,expected] of [['https://example.supabase.co/rest/v1/faqs',true],['https://example.supabase.co/functions/v1/analyze-content',true],['https://example.supabase.co/functions/v1/export-faqs',false],['https://other.invalid/rest/v1/faqs',false]] as const) {
    await rolloutFetch(url,{headers:{Authorization:'test-placeholder'}});
    const headers=fetchMock.mock.calls.at(-1)![1].headers as Headers;
    expect(headers.get('x-faqify-client')).toBe(expected?String(CLIENT_REVISION):null);
    expect(headers.get('Authorization')).toBe('test-placeholder');
  }
});
it('surfaces stale/error state without consuming the caller response or reloading',async()=>{
  fetchMock.mockImplementation(async()=>new Response(JSON.stringify({code:'PT426'}),{status:426}));
  const result=await rolloutFetch('https://example.supabase.co/rest/v1/faqs');
  expect(await result.json()).toEqual({code:'PT426'});
  expect(rolloutSnapshot().minimum_client_revision).toBeGreaterThan(CLIENT_REVISION);
  fetchMock.mockImplementation(async()=>new Response(JSON.stringify({mode:'drain',minimum_client_revision:1})));
  expect((await refreshRollout()).mode).toBe('drain');
});
