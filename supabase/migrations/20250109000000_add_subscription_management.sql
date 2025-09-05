-- Add subscription management features
-- Auto-renewal, cancellation, payment status tracking

-- 1. Add new columns to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring')),
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual' CHECK (subscription_source IN ('manual', 'stripe', 'razorpay'));

-- 2. Create subscription_cancellations table for tracking cancellation details
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

-- 3. Create subscription_renewals table for tracking renewal history
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

-- 4. Update existing subscriptions to have proper defaults
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

-- 5. Create function to handle subscription cancellation
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

  -- Create audit trail
  INSERT INTO public.subscription_history (
    user_id, from_plan_tier, to_plan_tier, change_type, 
    change_reason, effective_date, previous_expiration, new_expiration
  ) VALUES (
    p_user_id, v_subscription.plan_tier, v_subscription.plan_tier, 'cancellation',
    p_reason, v_effective_date, v_subscription.plan_expires_at, v_effective_date
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

-- 6. Create function to reactivate cancelled subscription
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

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renewal ON public.user_subscriptions(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancelled_at ON public.user_subscriptions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing ON public.user_subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_user ON public.subscription_cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_renewals_user ON public.subscription_renewals(user_id);

-- 8. Enable RLS on new tables
ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_renewals ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies
CREATE POLICY "Users can view their own cancellations" ON public.subscription_cancellations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own renewals" ON public.subscription_renewals
  FOR SELECT USING (auth.uid() = user_id);

-- 10. Create function to handle plan changes with proper date logic
CREATE OR REPLACE FUNCTION public.change_subscription_plan(
  p_user_id UUID,
  p_new_plan_tier plan_tier,
  p_payment_gateway TEXT DEFAULT 'manual',
  p_payment_id TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_current_subscription RECORD;
  v_new_activation_date TIMESTAMPTZ;
  v_new_expiry_date TIMESTAMPTZ;
  v_change_type TEXT;
  v_result JSON;
BEGIN
  -- Get current subscription
  SELECT * INTO v_current_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No subscription found');
  END IF;

  -- Determine change type
  IF v_current_subscription.plan_tier = 'Free' AND p_new_plan_tier != 'Free' THEN
    v_change_type := 'upgrade';
  ELSIF v_current_subscription.plan_tier != 'Free' AND p_new_plan_tier = 'Free' THEN
    v_change_type := 'downgrade';
  ELSIF v_current_subscription.plan_tier != p_new_plan_tier THEN
    v_change_type := CASE
      WHEN (v_current_subscription.plan_tier = 'Pro' AND p_new_plan_tier = 'Business') OR
           (v_current_subscription.plan_tier = 'Free' AND p_new_plan_tier = 'Business') THEN 'upgrade'
      ELSE 'downgrade'
    END;
  ELSE
    v_change_type := 'renewal';
  END IF;

  -- Calculate new dates
  v_new_activation_date := NOW();

  -- For upgrades/downgrades/renewals, always reset to new monthly period
  v_new_expiry_date := v_new_activation_date + INTERVAL '1 month';

  -- Update subscription
  UPDATE public.user_subscriptions
  SET
    plan_tier = p_new_plan_tier,
    plan_activated_at = v_new_activation_date,
    plan_expires_at = CASE
      WHEN p_new_plan_tier = 'Free' THEN NULL
      ELSE v_new_expiry_date
    END,
    plan_changed_at = v_new_activation_date,
    auto_renewal = CASE
      WHEN p_new_plan_tier = 'Free' THEN false
      ELSE true
    END,
    payment_type = CASE
      WHEN p_new_plan_tier = 'Free' THEN 'one_time'
      ELSE 'recurring'
    END,
    billing_cycle = 'monthly',
    subscription_source = CASE
      WHEN p_payment_gateway != 'manual' THEN p_payment_gateway
      ELSE subscription_source
    END,
    next_billing_date = CASE
      WHEN p_new_plan_tier != 'Free' THEN v_new_expiry_date
      ELSE NULL
    END,
    cancelled_at = NULL,
    cancellation_reason = NULL,
    status = 'active',
    updated_at = v_new_activation_date
  WHERE user_id = p_user_id;

  -- Record the change in history
  INSERT INTO public.subscription_history (
    user_id, from_plan_tier, to_plan_tier, change_type,
    change_reason, effective_date, previous_expiration, new_expiration,
    metadata
  ) VALUES (
    p_user_id, v_current_subscription.plan_tier, p_new_plan_tier, v_change_type,
    'Plan change via ' || p_payment_gateway, v_new_activation_date,
    v_current_subscription.plan_expires_at, v_new_expiry_date,
    json_build_object(
      'payment_gateway', p_payment_gateway,
      'payment_id', p_payment_id,
      'previous_auto_renewal', v_current_subscription.auto_renewal
    )
  );

  -- Record renewal if applicable
  IF v_change_type IN ('upgrade', 'downgrade', 'renewal') AND p_new_plan_tier != 'Free' THEN
    INSERT INTO public.subscription_renewals (
      user_id, subscription_id, previous_plan_tier, new_plan_tier,
      renewal_type, payment_amount, payment_currency, payment_gateway,
      payment_id, next_renewal_date
    ) VALUES (
      p_user_id, v_current_subscription.id, v_current_subscription.plan_tier, p_new_plan_tier,
      v_change_type, 0, 'USD', p_payment_gateway,
      p_payment_id, v_new_expiry_date
    );
  END IF;

  v_result := json_build_object(
    'success', true,
    'change_type', v_change_type,
    'new_activation_date', v_new_activation_date,
    'new_expiry_date', v_new_expiry_date,
    'message', 'Plan changed successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Grant permissions
GRANT SELECT ON public.subscription_cancellations TO authenticated;
GRANT SELECT ON public.subscription_renewals TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_subscription_plan TO authenticated;
