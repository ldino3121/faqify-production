-- 🔧 Update Supabase Configuration for Production
-- This script helps configure Supabase for production deployment

-- 1. Update auth configuration (run in Supabase SQL Editor)
-- Note: Some settings need to be updated via Supabase Dashboard

-- Update site URL and redirect URLs
-- (These need to be set in Supabase Dashboard → Authentication → Settings)

/*
REQUIRED SETTINGS IN SUPABASE DASHBOARD:

1. Go to: https://supabase.com/dashboard/project/dlzshcshqjdghmtzlbma/auth/users
2. Click on "Authentication" → "Settings"
3. Update these fields:

Site URL:
https://faqify-production.vercel.app

Redirect URLs (add all of these):
https://faqify-production.vercel.app/auth/callback
https://faqify-production.vercel.app/dashboard
https://faqify-production.vercel.app/
https://faqify-production.vercel.app/**

Additional Redirect URLs:
https://faqify-production.vercel.app/auth/confirm
https://faqify-production.vercel.app/login
https://faqify-production.vercel.app/signup

4. Email Templates (to change branding):
   - Go to "Email Templates" section
   - Update all templates to replace "dlzshcshqjdghmtzlbma.supabase.co" with "FAQify"

5. OAuth Providers:
   - Ensure Google OAuth is enabled
   - Ensure GitHub OAuth is enabled
   - Update redirect URIs in Google/GitHub console if needed
*/

-- 2. Verify current auth settings
SELECT 
    'Current auth configuration' as info,
    raw_app_meta_data,
    raw_user_meta_data
FROM auth.users 
LIMIT 1;

-- 3. Update any existing user sessions (if needed)
-- This will force users to re-authenticate with new settings
-- UNCOMMENT ONLY IF NEEDED:
-- DELETE FROM auth.sessions WHERE updated_at < NOW() - INTERVAL '1 hour';

-- 4. Check current site configuration
-- (This is read-only, actual changes must be made in dashboard)
SELECT 
    'Site configuration check' as info,
    current_setting('app.settings.site_url', true) as site_url;

-- 5. Success message
SELECT 'Supabase configuration update script ready!' as status,
       'Remember to update settings in Supabase Dashboard' as reminder;
