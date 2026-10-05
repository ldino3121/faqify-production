import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";
import { formatMoney, resolveUserEmail, sendEmail } from "../_shared/email.ts";
import { cancelSupersededSubscription } from "../_shared/razorpay.ts";
import {
  paymentFailedEmail,
  planActivatedEmail,
  receiptEmail,
  subscriptionCancelledEmail,
} from "../_shared/email-templates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    
    if (!webhookSecret) {
      throw new Error('Razorpay webhook secret not configured');
    }

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      throw new Error('Missing Razorpay signature');
    }

    // Verify webhook signature
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('Webhook signature verification failed');
      return new Response('Webhook signature verification failed', { status: 400 });
    }

    // Parse the webhook payload
    const event = JSON.parse(body);
    console.log('Processing Razorpay webhook event:', event.event);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        console.log('Payment captured:', payment.id);

        // Find the transaction record
        const { data: transaction, error: transactionError } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('razorpay_order_id', payment.order_id)
          .single();

        if (transactionError || !transaction) {
          console.error('Transaction not found for order:', payment.order_id);
          break;
        }

        // Update transaction status
        const { error: updateError } = await supabase
          .from('payment_transactions')
          .update({
            razorpay_payment_id: payment.id,
            status: 'completed',
            completed_at: new Date().toISOString(),
            gateway_response: {
              ...transaction.gateway_response,
              webhook_payment: payment,
              captured_at: new Date().toISOString()
            }
          })
          .eq('id', transaction.id);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
        } else {
          console.log('Transaction updated successfully:', transaction.id);
          await deliverReceipt(supabase, transaction, payment.id);
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        console.log('Payment failed:', payment.id);

        // Find and update transaction record
        const { data: transaction, error: transactionError } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('razorpay_order_id', payment.order_id)
          .single();

        if (transactionError || !transaction) {
          console.error('Transaction not found for failed payment:', payment.order_id);
          break;
        }

        // Update transaction status
        const { error: updateError } = await supabase
          .from('payment_transactions')
          .update({
            razorpay_payment_id: payment.id,
            status: 'failed',
            failed_at: new Date().toISOString(),
            failure_reason: payment.error_description || 'Payment failed',
            gateway_response: {
              ...transaction.gateway_response,
              webhook_payment: payment,
              failed_at: new Date().toISOString()
            }
          })
          .eq('id', transaction.id);

        if (updateError) {
          console.error('Error updating failed transaction:', updateError);
        } else {
          console.log('Failed transaction updated:', transaction.id);
          await deliverPaymentFailed(supabase, transaction, payment.error_description);
        }
        break;
      }

      case 'subscription.charged': {
        const subscription = event.payload.subscription.entity;
        const payment = event.payload.payment.entity;
        console.log('Subscription charged:', subscription.id);

        // Idempotency: ignore duplicate charge webhooks for the same payment
        const { data: existingChargeTx } = await supabase
          .from('payment_transactions')
          .select('id')
          .eq('razorpay_payment_id', payment.id)
          .maybeSingle();
        if (existingChargeTx) {
          console.log('Duplicate charge event ignored:', payment.id);
          break;
        }

        // Find user by Razorpay subscription ID
        const { data: userSubscription, error: userError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('razorpay_subscription_id', subscription.id)
          .single();

        if (userError || !userSubscription) {
          console.error('User subscription not found:', subscription.id);
          break;
        }

        // Create new transaction record for renewal
        const { error: transactionError } = await supabase
          .from('payment_transactions')
          .insert({
            user_id: userSubscription.user_id,
            subscription_id: userSubscription.id,
            payment_gateway: 'razorpay',
            transaction_type: 'renewal',
            razorpay_payment_id: payment.id,
            amount: payment.amount,
            currency: payment.currency.toLowerCase(),
            status: 'completed',
            plan_tier: userSubscription.plan_tier,
            plan_duration: 'monthly',
            completed_at: new Date().toISOString(),
            gateway_response: {
              webhook_subscription: subscription,
              webhook_payment: payment
            }
          });

        if (transactionError) {
          console.error('Error creating renewal transaction:', transactionError);
        }

        // Update subscription period
        const currentPeriodEnd = new Date(subscription.current_end * 1000);
        const { error: subscriptionError } = await supabase
          .from('user_subscriptions')
          .update({
            plan_expires_at: currentPeriodEnd.toISOString(),
            status: 'active',
            // Renewal paid -> fresh monthly quota for the new billing cycle.
            faq_usage_current: 0,
            last_reset_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', userSubscription.id);

        if (subscriptionError) {
          console.error('Error updating subscription period:', subscriptionError);
        } else {
          console.log('Subscription renewed successfully:', userSubscription.id);
          await deliverReceipt(supabase, {
            user_id: userSubscription.user_id,
            amount: payment.amount,
            currency: payment.currency,
            plan_tier: userSubscription.plan_tier,
          }, payment.id, { nextBillingLabel: currentPeriodEnd.toISOString() });
        }
        break;
      }

      case 'subscription.cancelled': {
        const subscription = event.payload.subscription.entity;
        console.log('Subscription cancelled:', subscription.id);

        // Find and update user subscription
        const { data: userSubscription, error: userError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('razorpay_subscription_id', subscription.id)
          .single();

        if (userError || !userSubscription) {
          console.error('User subscription not found for cancellation:', subscription.id);
          break;
        }

        // Update subscription status
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', userSubscription.id);

        if (updateError) {
          console.error('Error updating cancelled subscription:', updateError);
        } else {
          console.log('Subscription cancelled successfully:', userSubscription.id);
          await deliverCancelled(
            supabase,
            userSubscription.user_id,
            String(userSubscription.plan_tier ?? "Pro"),
            userSubscription.plan_expires_at,
          );
        }

        // Log cancellation in history
        const { error: historyError } = await supabase
          .from('subscription_history')
          .insert({
            user_id: userSubscription.user_id,
            from_plan_tier: userSubscription.plan_tier,
            to_plan_tier: 'Free',
            change_type: 'cancellation',
            change_reason: 'Subscription cancelled via Razorpay webhook',
            effective_date: new Date().toISOString(),
            metadata: {
              razorpay_subscription_id: subscription.id,
              cancelled_at: new Date().toISOString()
            }
          });

        if (historyError) {
          console.error('Error logging cancellation history:', historyError);
        }
        break;
      }

      case 'subscription.activated': {
        const subscription = event.payload.subscription.entity;
        console.log('Subscription activated:', subscription.id);

        // Find user by subscription notes
        const userId = subscription.notes?.user_id;
        if (!userId) {
          console.error('No user_id in subscription notes');
          break;
        }

        // Idempotency: skip if this subscription is already active for the user
        const { data: existingSub } = await supabase
          .from('user_subscriptions')
          .select('status, razorpay_subscription_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (existingSub?.status === 'active' && existingSub?.razorpay_subscription_id === subscription.id) {
          console.log('Subscription already activated, ignoring duplicate:', subscription.id);
          break;
        }

        // Get plan details from subscription notes
        const planTier = subscription.notes?.plan_tier || 'Pro';
        const faqLimit = subscription.notes?.faq_limit || '100';

        // Update user subscription
        const { error } = await supabase
          .from('user_subscriptions')
          .update({
            razorpay_subscription_id: subscription.id,
            status: 'active',
            plan_tier: planTier,
            faq_usage_limit: parseInt(faqLimit),
            // First activation credits the full plan quota from zero.
            faq_usage_current: 0,
            last_reset_date: new Date().toISOString(),
            plan_activated_at: new Date().toISOString(),
            plan_expires_at: new Date(subscription.current_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating subscription:', error);
        } else {
          console.log('Subscription activated for user:', userId);
          // Plan switch: cancel the previous Razorpay subscription (at cycle
          // end) so the superseded plan stops renewing — otherwise the customer
          // is double-billed. Runs AFTER the update above, so a late
          // `subscription.cancelled` event for the old id no longer matches.
          await cancelSupersededSubscription(existingSub?.razorpay_subscription_id, subscription.id);
          await deliverPlanActivated(
            supabase,
            userId,
            String(planTier),
            String(faqLimit),
            new Date(subscription.current_end * 1000).toISOString(),
          );
        }
        break;
      }

      case 'subscription.pending': {
        const subscription = event.payload.subscription.entity;
        console.log('Subscription pending:', subscription.id);

        // Find user by subscription ID
        const { data: userSubscription, error: userError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('razorpay_subscription_id', subscription.id)
          .single();

        if (userError || !userSubscription) {
          console.error('User subscription not found for pending:', subscription.id);
          break;
        }

        // Update subscription status to pending (don't downgrade plan yet)
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', userSubscription.id);

        if (updateError) {
          console.error('Error updating pending subscription:', updateError);
        } else {
          console.log('Subscription marked as pending:', userSubscription.id);
        }
        break;
      }

      case 'subscription.completed': {
        const subscription = event.payload.subscription.entity;
        console.log('Subscription completed:', subscription.id);

        // Find user by Razorpay subscription ID
        const { data: userSubscription, error: userError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('razorpay_subscription_id', subscription.id)
          .single();

        if (userError || !userSubscription) {
          console.error('User subscription not found:', subscription.id);
          break;
        }

        // Downgrade to Free plan
        const { error } = await supabase
          .from('user_subscriptions')
          .update({
            plan_tier: 'Free',
            // Free rows are `active` everywhere else (Free never expires);
            // restoring the sentinel keeps the "Plan Expires: Never" invariant.
            status: 'active',
            faq_usage_limit: 5,
            faq_usage_current: 0,
            last_reset_date: new Date().toISOString(),
            plan_expires_at: new Date('2099-12-31T23:59:59Z').toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', userSubscription.id);

        if (error) {
          console.error('Error completing subscription:', error);
        } else {
          console.log('Subscription completed for user:', userSubscription.user_id);
        }
        break;
      }

      default:
        console.log('Unhandled webhook event type:', event.event);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(`Webhook error: ${error.message}`, { status: 400 });
  }
});

/* --------------------------------------------------------- transactional email
 * Best effort by design: sendEmail never throws and degrades to a logged no-op
 * until RESEND_API_KEY is configured, so an email outage can never make a
 * payment webhook return non-2xx (which would cause Razorpay to retry).
 */

function formatWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function deliverReceipt(
  supabase: any,
  tx: any,
  paymentId?: string,
  opts: { nextBillingLabel?: string } = {},
) {
  try {
    const { email, name } = await resolveUserEmail(supabase, tx?.user_id);
    if (!email) return;

    await sendEmail({
      to: email,
      ...receiptEmail({
        name,
        planTier: String(tx?.plan_tier ?? "Pro"),
        amountLabel: formatMoney(tx?.amount, tx?.currency),
        reference:
          paymentId ??
          tx?.razorpay_payment_id ??
          tx?.razorpay_order_id ??
          null,
        nextBillingLabel: opts.nextBillingLabel ?? null,
      }),
    });
  } catch (err) {
    console.error("[email] receipt delivery failed", err);
  }
}

async function deliverPaymentFailed(supabase: any, tx: any, reason?: string) {
  try {
    const { email, name } = await resolveUserEmail(supabase, tx?.user_id);
    if (!email) return;

    await sendEmail({
      to: email,
      ...paymentFailedEmail({
        name,
        planTier: String(tx?.plan_tier ?? "Pro"),
        amountLabel: formatMoney(tx?.amount, tx?.currency),
        reason: reason ?? null,
      }),
    });
  } catch (err) {
    console.error("[email] failure notice delivery failed", err);
  }
}

async function deliverPlanActivated(
  supabase: any,
  userId: string,
  planTier: string,
  faqLimit: string,
  expiresIso: string,
) {
  try {
    const { email, name } = await resolveUserEmail(supabase, userId);
    if (!email) return;

    await sendEmail({
      to: email,
      ...planActivatedEmail({
        name,
        planTier,
        faqLimit,
        expiresLabel: formatWhen(expiresIso),
      }),
    });
  } catch (err) {
    console.error("[email] activation notice delivery failed", err);
  }
}

async function deliverCancelled(
  supabase: any,
  userId: string,
  planTier: string,
  untilIso?: string | null,
) {
  try {
    const { email, name } = await resolveUserEmail(supabase, userId);
    if (!email) return;

    await sendEmail({
      to: email,
      ...subscriptionCancelledEmail({
        name,
        planTier,
        untilLabel: formatWhen(untilIso),
      }),
    });
  } catch (err) {
    console.error("[email] cancellation notice delivery failed", err);
  }
}
