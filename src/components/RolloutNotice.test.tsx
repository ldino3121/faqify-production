import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RolloutNotice } from './RolloutNotice';
import { refreshRollout } from '@/lib/rollout';
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>vi.unstubAllGlobals());
it('does not announce maintenance before the first status response, but reports a real failure',async()=>{
  vi.resetModules();
  let resolveRequest!: (value: Response) => void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{resolveRequest=resolve;})));
  const { RolloutNotice: FreshNotice } = await import('./RolloutNotice');
  const host=document.createElement('div');const root=createRoot(host);
  await act(async()=>root.render(<FreshNotice/>));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async()=>resolveRequest(new Response('{}',{status:503})));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Writes are temporarily unavailable.');
  await act(async()=>root.unmount());
});
it('keeps an existing editor/draft mounted through drain, freeze and stale-client notices; refresh requires acknowledgement',async()=>{
  let mode='open'; let revision=1; let mounts=0;
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({mode,minimum_client_revision:revision}))));
  function Editor(){const [draft]=useState(()=>{mounts++;return 'unsaved private draft';});return <textarea defaultValue={draft}/>;}
  const host=document.createElement('div');const root=createRoot(host);
  await act(async()=>root.render(<><RolloutNotice/><Editor/></>));
  const editor=host.querySelector('textarea');
  for(const state of ['drain','frozen','open']) {
    mode=state; revision=2;
    await act(async()=>{await refreshRollout();});
    expect(host.querySelector('textarea')).toBe(editor);
    expect(editor?.value).toBe('unsaved private draft');
    expect(host.querySelector('button')?.disabled).toBe(true);
  }
  await act(async()=>{(host.querySelector('input') as HTMLInputElement).click();});
  expect(host.querySelector('button')?.disabled).toBe(false);expect(mounts).toBe(1);
  await act(async()=>root.unmount());
});
