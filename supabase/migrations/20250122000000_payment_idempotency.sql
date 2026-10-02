-- Payment idempotency keys (P1-8)
-- Prevents double-activation when a webhook is retried or when both
-- verify-razorpay-payment and the webhook process the same payment.
-- Safe to re-run.

BEGIN;

-- One transaction row per payment id
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_payment_id
  ON public.payment_transactions (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- One transaction row per subscription id
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_tx_subscription_id
  ON public.payment_transactions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

-- One active subscription mapping per Razorpay subscription id
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_sub_razorpay_sub
  ON public.user_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

COMMIT;
