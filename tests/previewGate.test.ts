import { describe, expect, it } from 'vitest';
import { isReadOnlyBuild } from '../build/previewGate';

const stage = 'https://oltufhuxeaqgyyjbvgqo.supabase.co';
const prod = 'https://dlzshcshqjdghmtzlbma.supabase.co';

describe('build-time write gate', () => {
  const allowed = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/admin-control-center',
    VITE_SUPABASE_URL: stage, VITE_FAQIFY_STAGING_WRITES_ENABLED: 'true' };
  it('allows only the isolated PR preview', () => {
    expect(isReadOnlyBuild(allowed)).toBe(false);
    expect(isReadOnlyBuild({ ...allowed, VITE_SUPABASE_URL: prod })).toBe(true);
    expect(isReadOnlyBuild({ ...allowed, VERCEL_GIT_COMMIT_REF: 'another-branch' })).toBe(true);
    expect(isReadOnlyBuild({ ...allowed, VITE_FAQIFY_STAGING_WRITES_ENABLED: undefined })).toBe(true);
    expect(isReadOnlyBuild({ ...allowed, VERCEL_ENV: 'development' })).toBe(true);
  });
  it('keeps the existing reviewed Production gate', () => {
    expect(isReadOnlyBuild({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main',
      VITE_FAQIFY_WRITES_ENABLED: 'true', VITE_SUPABASE_URL: prod })).toBe(false);
    expect(isReadOnlyBuild({ VERCEL_ENV: 'production',
      VITE_FAQIFY_WRITES_ENABLED: 'true', VITE_SUPABASE_URL: prod })).toBe(false);
    expect(isReadOnlyBuild({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main',
      VITE_FAQIFY_WRITES_ENABLED: undefined, VITE_SUPABASE_URL: prod })).toBe(true);
  });
});
