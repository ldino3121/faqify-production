-- Monthly FAQ usage reset (per-subscription billing anniversary) + pg_cron schedule
-- ---------------------------------------------------------------------------
-- Applies via:  supabase db query --linked -f <this file>
-- (Do NOT `supabase db push` — several earlier migrations are applied-but-unrecorded.)
--
-- Why this migration exists:
--   1) There was NO monthly reset job in the live DB, so faq_usage_current grew
--      forever and users were silently locked out once they hit their limit.
--   2) The client (src/hooks/useSubscription.tsx, src/components/dashboard/FAQCreator.tsx)
--      already reads/writes `last_reset_date`, but that column was missing from the
--      live table, so the FAQCreator "recover a missing subscription" insert failed.
--
-- Model: each subscription resets once its own monthly window has elapsed
--   (last_reset_date -> +1 month). This aligns usage with each user's billing
--   anniversary and avoids resetting a paying user mid-cycle. The pg_cron job runs
--   daily; the reset itself only fires for rows whose window is due.
--
-- Idempotent / safe to re-run.

BEGIN;

-- 1) Add the column the client already expects.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS last_reset_date TIMESTAMPTZ;

-- Backfill existing rows so the first reset happens one month from their period start.
UPDATE public.user_subscriptions
SET last_reset_date = COALESCE(plan_activated_at, created_at, NOW())
WHERE last_reset_date IS NULL;

COMMENT ON COLUMN public.user_subscriptions.last_reset_date
  IS 'Timestamp of the last monthly FAQ-usage reset for this subscription';

-- 2) The reset routine: zero usage for every subscription whose monthly window elapsed.
--    Returns the number of rows that were reset.
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset_count integer;
BEGIN
  UPDATE public.user_subscriptions
  SET faq_usage_current = 0,
      last_reset_date = NOW(),
      updated_at = NOW()
  WHERE COALESCE(last_reset_date, plan_activated_at, created_at, NOW())
          <= (NOW() - INTERVAL '1 month');

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$;

COMMENT ON FUNCTION public.reset_monthly_usage()
  IS 'Resets faq_usage_current to 0 for subscriptions whose monthly cycle has elapsed. Returns rows reset.';

-- 3) Lock the routine down. Postgres grants EXECUTE to PUBLIC by default, which would
--    let any authenticated user call it via RPC and reset everyone's quota for free.
REVOKE ALL ON FUNCTION public.reset_monthly_usage() FROM PUBLIC;

COMMIT;

-- 4) Schedule it. pg_cron must live in the `postgres` database (the CLI default).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent (re)schedule: drop any prior job with the same name first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'faqify-monthly-quota-reset') THEN
    PERFORM cron.unschedule('faqify-monthly-quota-reset');
  END IF;
END $$;

-- Runs daily at 00:05 UTC; the function resets only rows whose own month is due.
SELECT cron.schedule(
  'faqify-monthly-quota-reset',
  '5 0 * * *',
  $$ SELECT public.reset_monthly_usage(); $$
);