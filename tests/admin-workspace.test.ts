// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { clearAdminWorkspace, readAdminWorkspace, writeAdminWorkspace } from '../src/lib/admin-workspace';

afterEach(clearAdminWorkspace);
describe('admin workspace isolation', () => {
  it('keeps an edited draft and selected section across route remounts in one session', () => {
    const first = readAdminWorkspace('admin-a');
    writeAdminWorkspace('admin-a', first.generation, { tab: 'models', draft: [{ model_id: 'synthetic' }] });
    expect(readAdminWorkspace('admin-a').state).toMatchObject({ tab: 'models', draft: [{ model_id: 'synthetic' }] });
  });
  it('clears protected state on account change and rejects stale async writes', () => {
    const first = readAdminWorkspace('admin-a');
    writeAdminWorkspace('admin-a', first.generation, { tab: 'audit', secretAggregate: 1 });
    expect(readAdminWorkspace('ordinary-b').state).toEqual({});
    writeAdminWorkspace('admin-a', first.generation, { secretAggregate: 2 });
    expect(readAdminWorkspace('ordinary-b').state).toEqual({});
  });
});
