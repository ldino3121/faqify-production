// Centralized, typed access to public (VITE_*) environment variables.
// Required values fail fast so we never silently point at the wrong project.

const env = import.meta.env as Record<string, string | undefined>;

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Set it in .env (local) or in your hosting provider's environment settings.`,
    );
  }
  return value.trim();
}

export const SUPABASE_URL = required('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY);

// Public app URL used in embed codes / canonical links.
// Falls back to the current origin so the product keeps working before the
// production domain is purchased. Set VITE_PUBLIC_APP_URL once it exists.
export const PUBLIC_APP_URL: string = (() => {
  const fromEnv = env.VITE_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] VITE_PUBLIC_APP_URL is not set — falling back to current origin:',
      window.location.origin,
    );
    return window.location.origin;
  }
  return '';
})();

// Public Supabase URL used by generated embed widgets to fetch published FAQs.
export const PUBLIC_SUPABASE_URL: string =
  env.VITE_PUBLIC_SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || '';

export const RAZORPAY_KEY_ID: string = env.VITE_RAZORPAY_KEY_ID?.trim() ?? '';
