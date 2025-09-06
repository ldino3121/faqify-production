-- Check if subscription management migration is needed
-- Run this in Supabase SQL Editor to see what's missing

-- 1. Check if new columns exist in user_subscriptions table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_subscriptions'
  AND column_name IN (
    'auto_renewal',
    'cancelled_at', 
    'cancellation_reason',
    'payment_type',
    'next_billing_date',
    'billing_cycle',
    'subscription_source',
    'razorpay_subscription_id',
    'razorpay_plan_id'
  )
ORDER BY column_name;

-- 2. Check if payment_transactions table exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'payment_transactions'
    ) 
    THEN 'payment_transactions table EXISTS' 
    ELSE 'payment_transactions table MISSING - need to create it'
  END as payment_transactions_status;

-- 3. Check if subscription_cancellations table exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'subscription_cancellations'
    ) 
    THEN 'subscription_cancellations table EXISTS' 
    ELSE 'subscription_cancellations table MISSING - need to create it'
  END as cancellations_table_status;

-- 4. Check if India pricing columns exist
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'subscription_plans'
  AND column_name = 'price_inr';

-- 5. Check if cancel_subscription function exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'cancel_subscription'
    ) 
    THEN 'cancel_subscription function EXISTS' 
    ELSE 'cancel_subscription function MISSING - need to create it'
  END as cancel_function_status;

-- 6. Show current subscription plans with pricing
SELECT 
  name,
  price_monthly,
  COALESCE(price_inr, 0) as price_inr,
  faq_limit
FROM public.subscription_plans
ORDER BY price_monthly;

-- 7. Count users who might be affected
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN plan_tier != 'Free' THEN 1 END) as paid_users
FROM public.user_subscriptions;

-- =====================================================
-- INTERPRETATION:
-- 
-- If you see missing columns/tables/functions, you need to:
-- 1. Run the migration queries from previous messages
-- 2. The dashboard error will be fixed once migration is complete
-- 
-- If everything exists, the error might be due to:
-- 1. Cached data - try refreshing the page
-- 2. Network issues - check browser console
-- 3. Permission issues - check RLS policies
-- =====================================================
