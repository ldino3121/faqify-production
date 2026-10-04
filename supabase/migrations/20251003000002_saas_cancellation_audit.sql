-- ============================================================================
-- Reference-Check remediation #2 (October 2026 audit):
--
-- manage-razorpay-subscription (deployed, called 4x from useRazorpaySubscription)
-- writes a cancellation audit row to public.subscription_cancellations, which
-- never existed in the live database. The insert is a silent best-effort write,
-- so every customer-initiated cancellation was leaving no audit trail.
--
-- subscription_renewals is intentionally NOT created: no live code writes it.
--
-- Applied via `supabase db query --linked -f <file>` (NOT `db push`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_cancellations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid,
  subscription_id     uuid,
  cancelled_at        timestamptz NOT NULL DEFAULT now(),
  cancellation_reason text,
  effective_date      timestamptz,
  cancelled_by        text NOT NULL DEFAULT 'user',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_subscription_cancellations_user
  ON public.subscription_cancellations (user_id, cancelled_at DESC);

ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_cancellations TO service_role;

COMMENT ON TABLE public.subscription_cancellations IS
  'Cancellation audit trail written by manage-razorpay-subscription.';
