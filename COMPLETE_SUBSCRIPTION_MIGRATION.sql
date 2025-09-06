-- =====================================================
-- COMPLETE SUBSCRIPTION MANAGEMENT MIGRATION
-- This works for ALL users (existing Free users + new signups)
-- Run this in Supabase SQL Editor
-- =====================================================

-- PHASE 1: Add subscription management columns to user_subscriptions
-- =====================================================

-- 1.1: Add all subscription management columns with proper defaults
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

-- 1.2: Add India pricing to subscription_plans
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS price_inr INTEGER;

-- 1.3: Update subscription plans with India pricing
UPDATE public.subscription_plans 
SET price_inr = CASE 
  WHEN name = 'Pro' THEN 19900    -- ₹199 in paise
  WHEN name = 'Business' THEN 99900  -- ₹999 in paise
  ELSE NULL
END
WHERE name IN ('Pro', 'Business');

-- 1.4: Fix Free plan FAQ limit to 10 (as per requirements)
UPDATE public.subscription_plans 
SET faq_limit = 10
WHERE name = 'Free';

-- PHASE 2: Update ALL existing users with proper defaults
-- =====================================================

-- 2.1: Set proper defaults for ALL existing users
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
  subscription_source = CASE 
    WHEN plan_tier = 'Free' THEN 'manual'
    WHEN razorpay_customer_id IS NOT NULL THEN 'razorpay'
    WHEN stripe_customer_id IS NOT NULL THEN 'stripe'
    ELSE 'manual'
  END,
  next_billing_date = CASE 
    WHEN plan_tier != 'Free' AND current_period_end IS NOT NULL 
    THEN current_period_end 
    ELSE NULL 
  END
WHERE auto_renewal IS NULL;

-- 2.2: Update Free plan users to have correct FAQ limit (10)
UPDATE public.user_subscriptions 
SET faq_usage_limit = 10
WHERE plan_tier = 'Free' AND faq_usage_limit != 10;

-- PHASE 3: Create supporting tables
-- =====================================================

-- 3.1: Create payment_transactions table (if not exists)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  payment_gateway TEXT NOT NULL CHECK (payment_gateway IN ('stripe', 'razorpay')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('subscription', 'upgrade', 'renewal', 'refund')),
  
  -- Gateway-specific IDs
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  razorpay_signature TEXT,
  
  -- Transaction details
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- Plan information
  plan_tier TEXT NOT NULL,
  plan_duration TEXT NOT NULL CHECK (plan_duration IN ('monthly', 'yearly')),
  payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring', 'subscription')),
  
  -- Timestamps
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Additional data
  failure_reason TEXT,
  gateway_response JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2: Create subscription_cancellations table
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

-- PHASE 4: Update new user signup function
-- =====================================================

-- 4.1: Update handle_new_user function to include subscription management fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  activation_date TIMESTAMPTZ := NOW();
  expiry_date TIMESTAMPTZ := NOW() + INTERVAL '1 month';
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    activation_date,
    activation_date
  );
  
  -- Create subscription with all management fields
  INSERT INTO public.user_subscriptions (
    user_id, 
    plan_tier, 
    faq_usage_limit,
    faq_usage_current,
    plan_activated_at,
    plan_expires_at,
    last_reset_date,
    status,
    auto_renewal,
    payment_type,
    billing_cycle,
    subscription_source
  )
  VALUES (
    NEW.id, 
    'Free', 
    10,  -- Updated to 10 FAQs for Free plan
    0,
    activation_date,
    expiry_date,
    CURRENT_DATE,
    'active',
    false,  -- Free plan doesn't auto-renew
    'one_time',
    'monthly',
    'manual'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PHASE 5: Create subscription management functions
-- =====================================================

-- 5.1: Cancel subscription function
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
  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active subscription found');
  END IF;

  IF p_immediate OR v_subscription.plan_tier = 'Free' THEN
    v_effective_date := NOW();
  ELSE
    v_effective_date := COALESCE(v_subscription.current_period_end, NOW() + INTERVAL '1 month');
  END IF;

  UPDATE public.user_subscriptions
  SET 
    auto_renewal = false,
    cancelled_at = NOW(),
    cancellation_reason = p_reason,
    status = CASE 
      WHEN p_immediate THEN 'canceled'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = v_subscription.id;

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

-- 5.2: Reactivate subscription function
CREATE OR REPLACE FUNCTION public.reactivate_subscription(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_subscription RECORD;
  v_result JSON;
BEGIN
  SELECT * INTO v_subscription
  FROM public.user_subscriptions
  WHERE user_id = p_user_id AND cancelled_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No cancelled subscription found');
  END IF;

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

-- PHASE 6: Set up security and permissions
-- =====================================================

-- 6.1: Enable RLS on new tables
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_cancellations ENABLE ROW LEVEL SECURITY;

-- 6.2: Create RLS policies
CREATE POLICY "Users can view their own payment transactions" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment transactions" ON public.payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own cancellations" ON public.subscription_cancellations
  FOR SELECT USING (auth.uid() = user_id);

-- 6.3: Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.subscription_cancellations TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_subscription TO authenticated;

-- 6.4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_auto_renewal ON public.user_subscriptions(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancelled_at ON public.user_subscriptions(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing ON public.user_subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_user ON public.subscription_cancellations(user_id);

-- PHASE 7: Verification
-- =====================================================

-- 7.1: Verify subscription plans
SELECT 
  'SUBSCRIPTION PLANS' as check_type,
  name,
  price_monthly,
  price_inr,
  (price_inr / 100.0) as inr_rupees,
  faq_limit
FROM public.subscription_plans
ORDER BY price_monthly;

-- 7.2: Verify user subscriptions have new columns
SELECT 
  'USER SUBSCRIPTIONS' as check_type,
  COUNT(*) as total_users,
  COUNT(CASE WHEN auto_renewal IS NOT NULL THEN 1 END) as with_auto_renewal,
  COUNT(CASE WHEN payment_type IS NOT NULL THEN 1 END) as with_payment_type,
  COUNT(CASE WHEN plan_tier = 'Free' AND faq_usage_limit = 10 THEN 1 END) as free_users_with_10_faqs
FROM public.user_subscriptions;

-- 7.3: Verify tables exist
SELECT 
  'TABLES' as check_type,
  table_name,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('payment_transactions', 'subscription_cancellations', 'user_subscriptions', 'subscription_plans')
ORDER BY table_name;

-- =====================================================
-- MIGRATION COMPLETE!
-- 
-- This migration:
-- 1. ✅ Adds subscription management to ALL existing users
-- 2. ✅ Updates Free plan to 10 FAQs (correct limit)
-- 3. ✅ Adds India pricing (₹199/₹999)
-- 4. ✅ Creates all supporting tables and functions
-- 5. ✅ Updates signup function for new users
-- 6. ✅ Sets up proper security and permissions
-- 7. ✅ Works for existing Free users AND new signups
-- =====================================================
