-- =====================================================
-- Add Razorpay Support to Existing Database
-- =====================================================
-- This migration adds Razorpay payment gateway support
-- while preserving all existing Stripe functionality

-- Step 1: Add Razorpay columns to user_subscriptions table
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'stripe' CHECK (payment_gateway IN ('stripe', 'razorpay')),
ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd' CHECK (currency IN ('usd', 'inr', 'eur', 'gbp'));

-- Step 2: Add Razorpay price columns to subscription_plans table
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT,
ADD COLUMN IF NOT EXISTS price_inr INTEGER DEFAULT 0, -- Price in paise (Indian currency)
ADD COLUMN IF NOT EXISTS price_eur INTEGER DEFAULT 0, -- Price in cents (Euro)
ADD COLUMN IF NOT EXISTS price_gbp INTEGER DEFAULT 0; -- Price in pence (British Pound)

-- Step 3: Create payment_transactions table for tracking all payments
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  payment_gateway TEXT NOT NULL CHECK (payment_gateway IN ('stripe', 'razorpay')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('subscription', 'upgrade', 'renewal', 'refund')),
  
  -- Gateway-specific IDs
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  
  -- Transaction details
  amount INTEGER NOT NULL, -- Amount in smallest currency unit (cents/paise)
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- Plan information
  plan_tier plan_tier NOT NULL,
  plan_duration TEXT NOT NULL CHECK (plan_duration IN ('monthly', 'yearly')),
  
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

-- Step 4: Create payment_gateway_config table for storing gateway settings
CREATE TABLE IF NOT EXISTS public.payment_gateway_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway_name TEXT NOT NULL UNIQUE CHECK (gateway_name IN ('stripe', 'razorpay')),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  supported_currencies TEXT[] NOT NULL DEFAULT ARRAY['usd'],
  config_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 5: Insert default gateway configurations
INSERT INTO public.payment_gateway_config (gateway_name, is_enabled, supported_currencies, config_data)
VALUES 
  ('stripe', TRUE, ARRAY['usd', 'eur', 'gbp'], '{"webhook_configured": false, "test_mode": true}'),
  ('razorpay', TRUE, ARRAY['inr', 'usd', 'eur', 'gbp'], '{"webhook_configured": false, "test_mode": true}')
ON CONFLICT (gateway_name) DO NOTHING;

-- Step 6: Update subscription_plans with multi-currency pricing
UPDATE public.subscription_plans 
SET 
  price_inr = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 75000  -- ₹750 in paise (approx $9 USD)
    WHEN name = 'Business' THEN 240000  -- ₹2400 in paise (approx $29 USD)
  END,
  price_eur = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 850  -- €8.50 in cents
    WHEN name = 'Business' THEN 2700  -- €27 in cents
  END,
  price_gbp = CASE 
    WHEN name = 'Free' THEN 0
    WHEN name = 'Pro' THEN 750  -- £7.50 in pence
    WHEN name = 'Business' THEN 2400  -- £24 in pence
  END;

-- Step 7: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_razorpay_customer 
ON public.user_subscriptions(razorpay_customer_id) WHERE razorpay_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_gateway 
ON public.user_subscriptions(payment_gateway);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_gateway 
ON public.payment_transactions(user_id, payment_gateway);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status 
ON public.payment_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_date 
ON public.payment_transactions(transaction_date);

-- Step 8: Enable RLS on new tables
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_config ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS policies for payment_transactions
CREATE POLICY "Users can view their own payment transactions" ON public.payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment transactions" ON public.payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 10: Create RLS policies for payment_gateway_config (read-only for users)
CREATE POLICY "Users can view payment gateway config" ON public.payment_gateway_config
  FOR SELECT USING (TRUE);

-- Step 11: Create function to get payment gateway for user's location
CREATE OR REPLACE FUNCTION public.get_recommended_payment_gateway(user_country TEXT DEFAULT NULL)
RETURNS TEXT AS $$
BEGIN
  -- If user is from India, recommend Razorpay
  IF user_country = 'IN' OR user_country = 'India' THEN
    RETURN 'razorpay';
  END IF;
  
  -- For other countries, check if Stripe is available
  -- You can expand this logic based on Stripe's availability
  RETURN 'razorpay'; -- Default to Razorpay for international support
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 12: Create function to get currency for country
CREATE OR REPLACE FUNCTION public.get_currency_for_country(country_code TEXT DEFAULT 'US')
RETURNS TEXT AS $$
BEGIN
  RETURN CASE country_code
    WHEN 'IN' THEN 'inr'
    WHEN 'GB' THEN 'gbp'
    WHEN 'DE' THEN 'eur'
    WHEN 'FR' THEN 'eur'
    WHEN 'IT' THEN 'eur'
    WHEN 'ES' THEN 'eur'
    WHEN 'NL' THEN 'eur'
    ELSE 'usd'
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 13: Create function to get plan price in specific currency
CREATE OR REPLACE FUNCTION public.get_plan_price(plan_name plan_tier, target_currency TEXT DEFAULT 'usd')
RETURNS INTEGER AS $$
DECLARE
  price INTEGER;
BEGIN
  SELECT 
    CASE target_currency
      WHEN 'usd' THEN price_monthly
      WHEN 'inr' THEN price_inr
      WHEN 'eur' THEN price_eur
      WHEN 'gbp' THEN price_gbp
      ELSE price_monthly
    END
  INTO price
  FROM public.subscription_plans
  WHERE name = plan_name;
  
  RETURN COALESCE(price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 14: Create trigger to update payment_transactions updated_at
CREATE OR REPLACE FUNCTION public.update_payment_transaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_payment_transaction_updated_at();

-- Step 15: Grant necessary permissions
GRANT SELECT ON public.payment_gateway_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT USAGE ON SEQUENCE payment_transactions_id_seq TO authenticated;

-- Step 16: Add helpful comments
COMMENT ON TABLE public.payment_transactions IS 'Tracks all payment transactions across different gateways';
COMMENT ON TABLE public.payment_gateway_config IS 'Configuration for different payment gateways';
COMMENT ON COLUMN public.user_subscriptions.payment_gateway IS 'Which payment gateway was used for this subscription';
COMMENT ON COLUMN public.user_subscriptions.currency IS 'Currency used for this subscription';

-- Migration completed successfully
-- This migration adds Razorpay support while preserving all existing Stripe functionality
