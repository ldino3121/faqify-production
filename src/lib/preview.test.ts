import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
it('blocks shared-database writes, function calls and auth before any network request', async () => {
  vi.stubEnv('VITE_FAQIFY_READ_ONLY', true); vi.resetModules();
  const network = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', network);
  const { rolloutFetch, requireRolloutOpen } = await import('./rollout');
  for (const [path, method] of [['/rest/v1/faqs','POST'],['/rest/v1/faqs','PATCH'],['/rest/v1/faqs','DELETE'],['/rest/v1/rpc/save_generated_faqs','POST'],['/rest/v1/rpc/save_generated_faqs','GET'],['/functions/v1/create-paddle-checkout','POST'],['/functions/v1/analyze-content','POST'],['/auth/v1/signup','POST']]) {
    expect((await rolloutFetch('https://example.supabase.co'+path, {method})).status).toBe(403);
  }
  await expect(requireRolloutOpen()).rejects.toThrow('Read-only preview');
  expect(network).not.toHaveBeenCalled();
  await rolloutFetch('https://example.supabase.co/rest/v1/faqs'); expect(network).toHaveBeenCalledOnce();
});
