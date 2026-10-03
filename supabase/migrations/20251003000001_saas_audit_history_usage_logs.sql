-- ============================================================================
-- Reference-Check remediation (October 2026 audit):
--
-- A systematic cross-check of every `.from('…')` in src/ and
-- supabase/functions against the live project found that all live-path code
-- references two tables that were DESIGNED (migrations + docs reference them)
-- but never created in the live database:
--
--   1. public.subscription_history — plan-change audit trail. Written by
--      verify-razorpay-payment, razorpay-webhook (cancellation) and
--      admin-set-plan. All three catch-and-log the failure, so upgrades
--      succeeded while the audit trail silently dropped every row.
--
--   2. public.subscription_usage_logs — per-event usage log. Written by
--      verify-razorpay-payment after every paid upgrade ('plan_changed').
--
-- No code changes are required: all writers already treat these as
-- best-effort, so after this migration the existing INSERTs start landing.
--
-- Design notes:
--   - No foreign keys on purpose: an audit log must never block the payment
--     flow that produces it (a missing/deleted profile row must not fail an
--     INSERT).
--   - Service-role writers only. RLS is enabled with no anon/authenticated
--     policies — users read their own billing state through
--     user_subscriptions / payment_transactions, unchanged.
--
-- Applied via `supabase db query --linked -f <file>` (NOT `db push`).
-- ============================================================================

-- 1) ---------------------------------------------------- subscription_history
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid,
  from_plan_tier      text,
  to_plan_tier        text,
  change_type         text,
  change_reason       text,
  effective_date      timestamptz NOT NULL DEFAULT now(),
  previous_expiration timestamptz,
  new_expiration      timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_subscription_history_user_recent
  ON public.subscription_history (user_id, effective_date DESC);

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_history TO service_role;

COMMENT ON TABLE public.subscription_history IS
  'Append-only plan-change audit trail written by verify-razorpay-payment, razorpay-webhook and admin-set-plan.';

-- 2) ------------------------------------------------- subscription_usage_logs
CREATE TABLE IF NOT EXISTS public.subscription_usage_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid,
  subscription_id   uuid,
  action_type       text NOT NULL,
  usage_before      integer,
  usage_after       integer,
  limit_at_time     integer,
  plan_tier_at_time text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_usage_logs_user_recent
  ON public.subscription_usage_logs (user_id, created_at DESC);

ALTER TABLE public.subscription_usage_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_usage_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_usage_logs TO service_role;

COMMENT ON TABLE public.subscription_usage_logs IS
  'Append-only per-event usage log (e.g. plan_changed) written after paid upgrades.';
