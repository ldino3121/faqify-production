-- =====================================================
-- UPDATE INDIA PRICING IN SUBSCRIPTION PLANS
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add price_inr column if it doesn't exist
ALTER TABLE public.subscription_plans 
ADD COLUMN IF NOT EXISTS price_inr INTEGER;

-- 2. Update Pro plan with India pricing (₹199)
UPDATE public.subscription_plans 
SET 
  price_inr = 19900,  -- ₹199 in paise
  updated_at = NOW()
WHERE name = 'Pro';

-- 3. Update Business plan with India pricing (₹999)
UPDATE public.subscription_plans 
SET 
  price_inr = 99900,  -- ₹999 in paise
  updated_at = NOW()
WHERE name = 'Business';

-- 4. Verify the pricing update
SELECT 
  name as plan_name,
  price_monthly as usd_monthly,
  price_inr as inr_paise,
  (price_inr / 100.0) as inr_rupees,
  faq_limit,
  updated_at
FROM public.subscription_plans
ORDER BY price_monthly;

-- 5. Show pricing comparison
SELECT 
  'Pricing Comparison' as info,
  'Pro Plan' as plan,
  '$9 USD' as international_price,
  '₹199 INR' as india_price,
  'Savings: ~78%' as savings
UNION ALL
SELECT 
  'Pricing Comparison' as info,
  'Business Plan' as plan,
  '$29 USD' as international_price,
  '₹999 INR' as india_price,
  'Savings: ~59%' as savings;

-- =====================================================
-- PRICING UPDATE COMPLETE!
-- 
-- India-specific pricing:
-- - Pro Plan: $9 USD → ₹199 INR (78% savings)
-- - Business Plan: $29 USD → ₹999 INR (59% savings)
-- =====================================================
