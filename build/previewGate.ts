type BuildEnvironment = Record<string, string | undefined>;

const stagingUrl = 'https://oltufhuxeaqgyyjbvgqo.supabase.co';
const stagingBranch = 'feature/admin-control-center';

export function isReadOnlyBuild(env: BuildEnvironment): boolean {
  const productionWrites = env.VERCEL_ENV === 'production'
    && env.VITE_FAQIFY_WRITES_ENABLED === 'true';
  const isolatedPreviewWrites = env.VERCEL_ENV === 'preview'
    && env.VERCEL_GIT_COMMIT_REF === stagingBranch
    && env.VITE_SUPABASE_URL === stagingUrl
    && env.VITE_FAQIFY_STAGING_WRITES_ENABLED === 'true';
  return !(productionWrites || isolatedPreviewWrites);
}
