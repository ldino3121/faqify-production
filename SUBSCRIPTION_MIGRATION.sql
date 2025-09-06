-- =====================================================
-- SUBSCRIPTION MODEL MIGRATION FOR SUPABASE
-- Copy and paste these queries in Supabase SQL Editor
-- =====================================================

-- 1. Add subscription management columns to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription')),
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual' CHECK (subscription_source IN ('manual', 'stripe', 'razorpay')),
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT;

-- 2. Add payment_type column to payment_transactions table
ALTER TABLE public.payment_transactions 
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription'));

-- 3. Create subscription_cancellations table
CREATE TABLE IF NOT EXISTS public.subscription_cancellations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancellation_reason TEXT,
  cancelled_by TEXT DEFAULT 'user' CHECK (cancelled_by IN ('user', 'admin', 'system', 'payment_failure')),
  effective_date TIMESTAMPTZ NOT NULL,
  refund_amount INTEGER DEFAULT 0,
  refund_status TEXT DEFAULT 'none' CHECK (refund_status IN ('none', 'pending', 'processed', 'failed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create subscription_renewals table
CREATE TABLE IF NOT EXISTS public.subscription_renewals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  previous_plan_tier plan_tier NOT NULL,
  new_plan_tier plan_tier NOT NULL,
  renewal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  renewal_type TEXT NOT NULL CHECK (renewal_type IN ('auto', 'manual', 'upgrade', 'downgrade')),
  payment_amount INTEGER NOT NULL,
  payment_currency TEXT NOT NULL DEFAULT 'USD',
  payment_gateway TEXT NOT NULL,
  payment_id TEXT,
  next_renewal_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Update existing subscriptions with proper defaults
UPDATE public.user_subscriptions 
SET 
  auto_renewal = CASE 
    WHEN plan_tier = 'Free' THEN false 
    ELSE true 
  END,
  payment_type = CASE 
    WHEN plan_tier = 'Free' THEN 'one_time'
    ELSE 'recurring'
  END,
  billing_cycle = 'monthly',
  subscription_source = 'manual',
  next_billing_date = CASE 
    WHEN plan_tier != 'Free' AND plan_expires_at IS NOT NULL 
    THEN plan_expires_at 
    ELSE NULL 
  END
WHERE auto_renewal IS NULL;

-- 6. Create function to cancel subscription
CREATE OR REPLACE FUNCTION public.cancel_subscription(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_immediate BOOLEAN DEFAULT false
)
RETURNS JSON AS $$
DECLARE
  v_subscription RECORD;
  v_effective_date TIMESTAMPTZ;
  v_result JSON;
BEGIN
  -- Get current subscription
  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active subscription found');
  END IF;

  -- Determine effective date
  IF p_immediate OR v_subscription.plan_tier = 'Free' THEN
    v_effective_date := NOW();
  ELSE
    v_effective_date := COALESCE(v_subscription.plan_expires_at, NOW() + INTERVAL '1 month');
  END IF;

  -- Update subscription
  UPDATE public.user_subscriptions
  SET 
    auto_renewal = false,
    cancelled_at = NOW(),
    cancellation_reason = p_reason,
    status = CASE 
      WHEN p_immediate THEN 'cancelled'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = v_subscription.id;

  -- Record cancellation
  INSERT INTO public.subscription_cancellations (
    user_id, subscription_id, cancelled_at, cancellation_reason, 
    effective_date, cancelled_by
  ) VALUES (
    p_user_id, v_subscription.id, NOW(), p_reason, 
    v_effective_date, 'user'
  );

  v_result := json_build_object(
    'success', true,
    'effective_date', v_effective_date,
    'immediate', p_immediate,
    'message', CASE 
      WHEN p_immediate THEN 'Subscription cancelled immediately'
      ELSE 'Subscription will be cancelled at the end of current billing period'
    END
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to reactivate subscription
CREATE OR REPLACE FUNCTION public.reactivate_subscription(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_subscription RECORD;
  v_result JSON;
BEGIN
  -- Get cancelled subscription
  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id AND cancelled_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No cancelled subscription found');
  END IF;

  -- Reactivate subscription
  UPDATE public.user_subscriptions
  SET 
    auto_renewal = true,
    cancelled_at = NULL,
    cancellation_reason = NULL,
    status = 'active',
    updated_at = NOW()
  WHERE id = v_subscription.id;

  v_result := json_build_object(
    'success', true,
    'message', 'Subscription reactivated successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renewal ON public.user_subscriptions(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancelled_at ON public.user_subscriptions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing ON public.user_subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_sub ON public.user_subscriptions(razorpay_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_user ON public.subscription_cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_renewals_user ON public.subscription_renewals(user_id);

-- 9. Enable RLS on new tables
ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_renewals ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies
CREATE POLICY "Users can view their own cancellations" ON public.subscription_cancellations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own renewals" ON public.subscription_renewals
  FOR SELECT USING (auth.uid() = user_id);

-- 11. Grant permissions
GRANT SELECT ON public.subscription_cancellations TO authenticated;
GRANT SELECT ON public.subscription_renewals TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_subscription TO authenticated;

-- 12. Update subscription plans with India pricing (if table exists)
UPDATE public.subscription_plans 
SET 
  price_inr = CASE 
    WHEN name = 'Pro' THEN 19900  -- ₹199 in paise
    WHEN name = 'Business' THEN 99900  -- ₹999 in paise
    ELSE price_inr
  END,
  updated_at = NOW()
WHERE name IN ('Pro', 'Business');

-- 13. Verify the migration
SELECT 
  'Migration completed successfully!' as status,
  COUNT(*) as total_subscriptions,
  COUNT(CASE WHEN auto_renewal IS NOT NULL THEN 1 END) as subscriptions_with_auto_renewal,
  COUNT(CASE WHEN plan_tier = 'Free' AND faq_usage_limit = 10 THEN 1 END) as free_plans_with_correct_limit
FROM public.user_subscriptions;

-- 14. Show India pricing verification
SELECT 
  name as plan_name,
  price_monthly as usd_price,
  price_inr as inr_price_paise,
  (price_inr / 100.0) as inr_price_rupees
FROM public.subscription_plans
WHERE name IN ('Pro', 'Business')
ORDER BY price_monthly;

-- =====================================================
-- MIGRATION COMPLETE!
-- 
-- What this migration does:
-- 1. Adds subscription management fields
-- 2. Creates cancellation and renewal tracking tables
-- 3. Adds subscription management functions
-- 4. Sets up proper indexes and security
-- 5. Updates India-specific pricing
-- 6. Verifies the migration
-- =====================================================
