-- Roles + admin RLS (P1-11)
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles;
CREATE POLICY user_roles_select_self ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Admins can read all rows (support panel)
DROP POLICY IF EXISTS profiles_admin_select ON public.profiles;
CREATE POLICY profiles_admin_select ON public.profiles
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS user_subscriptions_admin_select ON public.user_subscriptions;
CREATE POLICY user_subscriptions_admin_select ON public.user_subscriptions
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS payment_transactions_admin_select ON public.payment_transactions;
CREATE POLICY payment_transactions_admin_select ON public.payment_transactions
  FOR SELECT USING (public.is_admin());

GRANT SELECT ON public.user_roles TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;

-- To grant yourself admin after this migration, run (replace the UUID):
--   INSERT INTO public.user_roles (user_id, role) VALUES ('<your-auth-user-uuid>', 'admin')
--   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
