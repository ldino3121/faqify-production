import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SubscriptionRequest {
  planId: 'Pro' | 'Business';
  userEmail: string;
  userName: string;
  currency?: 'USD';
  userCountry?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from JWT token
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { planId, userEmail, userName, currency, userCountry }: SubscriptionRequest = await req.json()

    // Validate plan
    if (!['Pro', 'Business'].includes(planId)) {
      throw new Error('Invalid plan selected')
    }

    // International strategy: Standard USD pricing
    const targetCurrency = 'USD'

    // Razorpay configuration
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_SECRET_KEY')

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    // Get plan details from database instead of hardcoded mapping
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: selectedPlan, error: planError } = await supabaseAdminClient
      .from('subscription_plans')
      .select('*')
      .eq('name', planId)
      .single();

    if (planError || !selectedPlan) {
      console.error('Plan not found in database:', { planId, planError });
      throw new Error(`Plan not found: ${planId}`);
    }

    console.log('Found plan in database:', selectedPlan);

    // Set USD pricing
    const currencyPlan = {
      amount: selectedPlan.price_monthly,
      currency: targetCurrency
    };

    // Get the Razorpay Plan ID from the plan we already fetched
    let razorpayPlanId = selectedPlan?.razorpay_plan_id_inr;

    // If no plan ID in database, use your actual Razorpay Plan IDs from dashboard
    if (!razorpayPlanId) {
      console.log('No plan ID in database, using actual Razorpay plan IDs from dashboard');
      if (planId === 'Pro') {
        // Using actual Pro Plan ID from your Razorpay dashboard
        razorpayPlanId = 'plan_REN5cBATpXrR7S';
      } else if (planId === 'Business') {
        // Using actual Business Plan ID from your Razorpay dashboard
        razorpayPlanId = 'plan_RENZeCMJQuFc8n';
      }
    }

    console.log('Final Razorpay Plan ID:', razorpayPlanId);
    console.log('Target Currency:', targetCurrency);
    console.log('Plan Configuration:', { planId, targetCurrency, selectedPlan, currencyPlan });

    if (!razorpayPlanId) {
      throw new Error(`No Razorpay Plan ID found for ${planId} plan with currency ${targetCurrency}`);
    }

    // Create subscription in Razorpay
    const subscriptionData = {
      plan_id: razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: 0, // 0 = unlimited (auto-renewal)
      start_at: Math.floor(Date.now() / 1000), // Start immediately
      notes: {
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        plan_tier: planId,
        faq_limit: selectedPlan.faq_limit.toString(),
        currency: targetCurrency,
        user_country: userCountry || 'Unknown',
        created_via: 'faqify_app',
        payment_type: 'subscription'
      }
    }

    // Create Razorpay subscription
    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)
    
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscriptionData),
    })

    if (!razorpayResponse.ok) {
      const errorData = await razorpayResponse.text()
      console.error('Razorpay subscription creation failed:', {
        status: razorpayResponse.status,
        statusText: razorpayResponse.statusText,
        error: errorData,
        planId: razorpayPlanId,
        subscriptionData
      })
      throw new Error(`Failed to create subscription: HTTP ${razorpayResponse.status} - ${errorData}`)
    }

    const razorpaySubscription = await razorpayResponse.json()

    console.log('Razorpay subscription created:', razorpaySubscription.id)

    // Store subscription in database
    const { error: dbError } = await supabaseClient
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        razorpay_order_id: razorpaySubscription.id,
        razorpay_payment_id: null, // Will be updated after payment
        razorpay_signature: null, // Will be updated after payment
        amount: currencyPlan.amount,
        currency: targetCurrency,
        status: 'created',
        plan_tier: planId as any,
        plan_duration: 'monthly',
        payment_type: 'subscription',
        metadata: {
          razorpay_subscription: razorpaySubscription,
          subscription_id: razorpaySubscription.id,
          plan_id: razorpayPlanId,
          billing_cycle: 'monthly',
          auto_renewal: true
        }
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to store subscription data')
    }

    // Return subscription details for frontend
    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: razorpaySubscription.id,
        plan_id: razorpayPlanId,
        amount: currencyPlan.amount,
        currency: targetCurrency,
        status: razorpaySubscription.status,
        short_url: razorpaySubscription.short_url, // Payment link
        customer_details: {
          email: userEmail,
          name: userName
        },
        billing_details: {
          plan_tier: planId,
          faq_limit: selectedPlan.faq_limit,
          billing_cycle: 'monthly',
          next_billing: new Date(razorpaySubscription.current_start * 1000).toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error creating subscription:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create subscription'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
