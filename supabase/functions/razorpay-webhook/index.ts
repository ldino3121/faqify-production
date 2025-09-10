import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

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
        }
        break;
      }

      case 'subscription.charged': {
        const subscription = event.payload.subscription.entity;
        const payment = event.payload.payment.entity;
        console.log('Subscription charged:', subscription.id);

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
            updated_at: new Date().toISOString()
          })
          .eq('id', userSubscription.id);

        if (subscriptionError) {
          console.error('Error updating subscription period:', subscriptionError);
        } else {
          console.log('Subscription renewed successfully:', userSubscription.id);
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

        // Update user subscription
        const { error } = await supabase
          .from('user_subscriptions')
          .update({
            razorpay_subscription_id: subscription.id,
            status: 'active',
            current_period_end: new Date(subscription.current_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating subscription:', error);
        } else {
          console.log('Subscription activated for user:', userId);
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
            status: 'expired',
            faq_usage_limit: 5,
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
