// In-memory only. Admin drafts and filters survive route remounts in this tab,
// but never enter localStorage and are invalidated on account changes/sign-out.
type Workspace = Record<string, unknown>;
let owner: string | null = null;
let state: Workspace = {};
let generation = 0;

export function readAdminWorkspace(userId: string) {
  if (owner !== userId) {
    owner = userId;
    state = {};
    generation += 1;
  }
  return { state: { ...state }, generation };
}

export function writeAdminWorkspace(userId: string, expectedGeneration: number, patch: Workspace) {
  if (owner !== userId || generation !== expectedGeneration) return;
  state = { ...state, ...patch };
}

export function clearAdminWorkspace() {
  owner = null;
  state = {};
  generation += 1;
}
