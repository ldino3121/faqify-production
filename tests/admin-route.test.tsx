import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), userId: 'admin-a' as string | null, loading: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.userId ? { id: mock.userId } : null, loading: mock.loading }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
import { AdminRoute } from '../src/components/AdminRoute';
import { clearAdminWorkspace } from '../src/lib/admin-workspace';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
async function mount() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root?.render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/admin']}><Routes>
      <Route path="/admin" element={<AdminRoute><p>Protected admin content</p></AdminRoute>} />
      <Route path="/dashboard" element={<p>Ordinary dashboard</p>} />
      <Route path="/login" element={<p>Login</p>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove(); root = undefined; container = undefined; client?.clear(); client = undefined;
  mock.rpc.mockReset(); mock.userId = 'admin-a'; mock.loading = false; clearAdminWorkspace();
});

describe('admin route authorization continuity', () => {
  it('keeps confirmed same-user content through a background failure and retry', async () => {
    mock.rpc.mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { status: 503, message: 'temporary' } })
      .mockResolvedValueOnce({ data: true, error: null });
    await mount();
    expect(container?.textContent).toContain('Protected admin content');
    await act(async () => { await client?.invalidateQueries({ queryKey: ['facc-access', 'admin-a'] }); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container?.textContent).toContain('Protected admin content');
    expect(container?.textContent).toContain('could not be rechecked');
    await act(async () => { (container?.querySelector('button') as HTMLButtonElement)?.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container?.textContent).toContain('Protected admin content');
    expect(container?.textContent).not.toContain('could not be rechecked');
  });
  it('removes protected content on a confirmed role denial', async () => {
    mock.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await mount();
    await act(async () => { await client?.invalidateQueries({ queryKey: ['facc-access', 'admin-a'] }); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container?.textContent).toContain('Ordinary dashboard');
    expect(container?.textContent).not.toContain('Protected admin content');
  });
});
