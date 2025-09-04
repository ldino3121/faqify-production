import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    // Get environment variables
    const razorpaySecret = Deno.env.get('RAZORPAY_SECRET_KEY');
    
    if (!razorpaySecret) {
      throw new Error('Razorpay configuration missing');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    }: VerifyPaymentRequest = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: 'Missing payment verification data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Verifying payment:', { razorpay_order_id, razorpay_payment_id });

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = createHmac('sha256', razorpaySecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('Invalid signature:', { expected: expectedSignature, received: razorpay_signature });
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Payment signature verified successfully');

    // Get transaction record
    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)
      .single();

    if (transactionError || !transaction) {
      console.error('Transaction not found:', transactionError);
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', transaction.plan_tier)
      .single();

    if (planError || !plan) {
      console.error('Plan not found:', planError);
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update transaction status
    const { error: updateTransactionError } = await supabase
      .from('payment_transactions')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        status: 'completed',
        completed_at: new Date().toISOString(),
        gateway_response: {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          signature: razorpay_signature,
          verified_at: new Date().toISOString()
        }
      })
      .eq('id', transaction.id);

    if (updateTransactionError) {
      console.error('Error updating transaction:', updateTransactionError);
    }

    // Calculate subscription dates
    const now = new Date();
    const planExpiresAt = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now

    // Update user subscription
    const { error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .update({
        plan_tier: transaction.plan_tier,
        payment_gateway: 'razorpay',
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        currency: transaction.currency,
        status: 'active',
        faq_usage_limit: plan.faq_limit,
        plan_activated_at: now.toISOString(),
        plan_expires_at: planExpiresAt.toISOString(),
        plan_changed_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq('user_id', user.id);

    if (subscriptionError) {
      console.error('Error updating subscription:', subscriptionError);
      return new Response(JSON.stringify({ error: 'Failed to update subscription' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Subscription updated successfully for user:', user.id);

    // Log subscription change
    const { error: historyError } = await supabase
      .from('subscription_history')
      .insert({
        user_id: user.id,
        from_plan_tier: 'Free', // Assuming upgrade from Free
        to_plan_tier: transaction.plan_tier,
        change_type: 'upgrade',
        change_reason: 'Payment completed via Razorpay',
        effective_date: now.toISOString(),
        new_expiration: planExpiresAt.toISOString(),
        metadata: {
          payment_gateway: 'razorpay',
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          amount: transaction.amount,
          currency: transaction.currency
        }
      });

    if (historyError) {
      console.error('Error logging subscription history:', historyError);
      // Don't fail the request for history logging errors
    }

    // Create usage log
    const { error: usageLogError } = await supabase
      .from('subscription_usage_logs')
      .insert({
        user_id: user.id,
        subscription_id: transaction.subscription_id,
        action_type: 'plan_changed',
        usage_before: 0,
        usage_after: 0,
        limit_at_time: plan.faq_limit,
        plan_tier_at_time: transaction.plan_tier,
        metadata: {
          payment_gateway: 'razorpay',
          payment_verified: true,
          upgrade_type: 'paid'
        }
      });

    if (usageLogError) {
      console.error('Error creating usage log:', usageLogError);
      // Don't fail the request for logging errors
    }

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        plan_tier: transaction.plan_tier,
        faq_limit: plan.faq_limit,
        expires_at: planExpiresAt.toISOString(),
        payment_gateway: 'razorpay'
      },
      payment: {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return new Response(JSON.stringify({ 
      error: 'Payment verification failed',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
