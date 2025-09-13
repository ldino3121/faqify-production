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
  currency?: 'USD' | 'INR' | 'EUR' | 'GBP';
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

    // Razorpay configuration
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_SECRET_KEY') ?? Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error('Missing Razorpay credentials:', {
        hasKeyId: !!razorpayKeyId,
        hasSecret: !!razorpayKeySecret,
        keyIdLength: razorpayKeyId?.length || 0,
        secretLength: razorpayKeySecret?.length || 0
      })
      throw new Error('Razorpay credentials not configured')
    }

    console.log('✅ Razorpay credentials found:', {
      keyId: razorpayKeyId?.substring(0, 10) + '...',
      hasSecret: !!razorpayKeySecret,
      keyIdLength: razorpayKeyId?.length,
      secretLength: razorpayKeySecret?.length
    })

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
    console.log('Plan pricing details:', {
      name: selectedPlan.name,
      price_monthly: selectedPlan.price_monthly,
      price_inr: selectedPlan.price_inr,
      razorpay_plan_id_inr: selectedPlan.razorpay_plan_id_inr,
      faq_limit: selectedPlan.faq_limit
    });

    // Set INR pricing for records - normalize to paise
    const targetCurrency = 'INR';
    // Normalize amount to paise regardless of whether DB stores rupees or paise
    const amountPaise = (() => {
      const p = selectedPlan?.price_inr;
      if (typeof p === 'number' && p > 0) {
        // If value looks like paise (>= 1000), use as-is; otherwise treat as rupees and convert
        return p >= 1000 ? Math.round(p) : Math.round(p * 100);
      }
      const fallback = selectedPlan?.price_monthly ?? 0; // assume rupees
      return Math.round(fallback * 100);
    })();
    const currencyPlan = {
      amount: amountPaise,
      currency: targetCurrency
    };

    // Use INR Razorpay Plan IDs from database
    let razorpayPlanId = selectedPlan?.razorpay_plan_id_inr;

    // If no plan ID in database, use your NEW INR Razorpay Plan IDs from dashboard
    if (!razorpayPlanId) {
      console.log('No plan ID in database, using NEW INR Razorpay plan IDs from dashboard');
      if (planId === 'Pro') {
        // NEW Pro Plan ID for ₹750 from your Razorpay dashboard
        razorpayPlanId = 'plan_RGcv1a3WtevwV8';
      } else if (planId === 'Business') {
        // NEW Business Plan ID for ₹2500 from your Razorpay dashboard
        razorpayPlanId = 'plan_RGcucvclIXXAgp';
      }
    }

    console.log('Final Razorpay Plan ID:', razorpayPlanId);
    console.log('Target Currency:', targetCurrency);
    console.log('Plan Configuration:', { planId, targetCurrency, selectedPlan, currencyPlan });

    if (!razorpayPlanId) {
      throw new Error(`No Razorpay Plan ID found for ${planId} plan with currency ${targetCurrency}`);
    }

    // Create ACTUAL SUBSCRIPTION for auto-renewal (not subscription link)
    // This creates a proper recurring subscription with auto-renewal
    // Razorpay requires total_count >= 1. Use a large value to simulate ongoing auto-renewal.
    const subscriptionData = {
      plan_id: razorpayPlanId,
      total_count: 120, // 10 years of monthly cycles (max allowed by API)
      quantity: 1,
      customer_notify: 1,
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

    console.log('🚀 Creating Razorpay SUBSCRIPTION (auto-renewal) with data:', {
      plan_id: subscriptionData.plan_id,
      total_count: subscriptionData.total_count,
      quantity: subscriptionData.quantity,
      customer_notify: subscriptionData.customer_notify,
      notes: subscriptionData.notes
    })

    // Use SUBSCRIPTIONS API for proper auto-renewal
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
      console.error('Razorpay SUBSCRIPTION creation failed:', {
        status: razorpayResponse.status,
        statusText: razorpayResponse.statusText,
        error: errorData,
        planId: razorpayPlanId,
        subscriptionData
      })
      throw new Error(`Failed to create subscription: HTTP ${razorpayResponse.status} - ${errorData}`)
    }

    const razorpaySubscription = await razorpayResponse.json()

    console.log('✅ Razorpay SUBSCRIPTION created:', {
      id: razorpaySubscription.id,
      status: razorpaySubscription.status,
      current_start: razorpaySubscription.current_start,
      current_end: razorpaySubscription.current_end
    })

    // Store SUBSCRIPTION in database
    const { error: dbError } = await supabaseClient
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        razorpay_subscription_id: razorpaySubscription.id,
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
          auto_renewal: true,
          current_start: razorpaySubscription.current_start,
          current_end: razorpaySubscription.current_end
        }
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to store subscription data')
    }

    // Return SUBSCRIPTION details for frontend
    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: razorpaySubscription.id,
        plan_id: razorpayPlanId,
        amount: currencyPlan.amount,
        currency: targetCurrency,
        status: razorpaySubscription.status,
        customer_details: {
          email: userEmail,
          name: userName
        },
        billing_details: {
          plan_tier: planId,
          faq_limit: selectedPlan.faq_limit,
          billing_cycle: 'monthly',
          current_start: new Date(razorpaySubscription.current_start * 1000).toISOString(),
          current_end: new Date(razorpaySubscription.current_end * 1000).toISOString(),
          auto_renewal: true
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
