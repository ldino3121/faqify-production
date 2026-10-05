-- Keep plan_id (enum, NOT NULL) in sync with the denormalized plan_tier text
-- column. Payment flows (verify-razorpay-payment, razorpay-webhook,
-- razorpay-subscription-webhook, admin-set-plan) write ONLY plan_tier, while
-- can_generate_faqs() reads plan_id for its server-side expiry branch — without
-- this trigger the expiry gate never fires for upgraded users (plan_id stays
-- 'Free' forever after an upgrade). There are no paying users yet, so no
-- production drift exists; the backfill below is a no-op safety net.
-- Applies via: supabase db query --linked -f <this file>  (never db push)

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_plan_id_from_plan_tier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Text -> enum when the text column carries a known tier (payments write this).
  IF NEW.plan_tier IS NOT NULL THEN
    IF NEW.plan_tier IN ('Free', 'Pro', 'Business') THEN
      NEW.plan_id := NEW.plan_tier::public.plan_tier;
    END IF;
  -- Enum -> text when the writer only set plan_id (e.g. legacy inserts).
  ELSIF NEW.plan_id IS NOT NULL THEN
    NEW.plan_tier := NEW.plan_id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_plan_id_on_plan_tier ON public.user_subscriptions;
CREATE TRIGGER sync_plan_id_on_plan_tier
BEFORE INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_plan_id_from_plan_tier();

-- Backfill: enum <- text for any drifted rows, then text for NULL text rows.
UPDATE public.user_subscriptions
SET plan_id = plan_tier::public.plan_tier
WHERE plan_tier IN ('Free', 'Pro', 'Business')
  AND plan_id IS DISTINCT FROM plan_tier::public.plan_tier;

UPDATE public.user_subscriptions
SET plan_tier = plan_id::text
WHERE plan_tier IS NULL
  AND plan_id IS NOT NULL;

COMMIT;
