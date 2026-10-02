-- Free tier collection cap (P1-13). Enforced in the DB, not just the UI.
-- Safe to re-run. Tolerant of legacy plan column naming (plan_tier vs plan_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_free_collection_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(to_jsonb(us)->>'plan_tier', to_jsonb(us)->>'plan_id')
    INTO v_plan
    FROM public.user_subscriptions us
    WHERE us.user_id = NEW.user_id;

  IF v_plan IS NULL OR v_plan = 'Free' THEN
    SELECT COUNT(*) INTO v_count FROM public.faq_collections WHERE user_id = NEW.user_id;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'Free plan is limited to 1 FAQ collection. Please upgrade to create more.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_free_collection_limit ON public.faq_collections;
CREATE TRIGGER enforce_free_collection_limit
  BEFORE INSERT ON public.faq_collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_collection_limit();

COMMIT;
