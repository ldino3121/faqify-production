-- Align live schema with the columns the deployed edge functions expect.
-- The live DB was built via ad-hoc SQL and is missing several columns that
-- verify-razorpay-payment / razorpay-webhook / create-razorpay-* write to.
-- Additive only (no data loss). Safe to re-run.

BEGIN;

-- 1) user_subscriptions: add columns referenced by the payment functions
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS plan_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS subscription_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Backfill plan_tier from the legacy enum column `plan_id`
UPDATE public.user_subscriptions
SET plan_tier = plan_id::text
WHERE plan_tier IS NULL AND plan_id IS NOT NULL;

-- 2) payment_transactions: add columns referenced by the payment functions
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT,
  ADD COLUMN IF NOT EXISTS gateway_response JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_id UUID,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Backfill payment_gateway from the legacy column `gateway`
UPDATE public.payment_transactions
SET payment_gateway = gateway
WHERE payment_gateway IS NULL AND gateway IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_user_sub_plan_tier ON public.user_subscriptions (plan_tier);
CREATE INDEX IF NOT EXISTS ix_payment_tx_gateway ON public.payment_transactions (payment_gateway);

COMMIT;