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

    const { planId, userEmail, userName }: SubscriptionRequest = await req.json()

    // Validate plan
    if (!['Pro', 'Business'].includes(planId)) {
      throw new Error('Invalid plan selected')
    }

    // Razorpay configuration
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    // Plan mapping
    const planMapping = {
      'Pro': {
        razorpay_plan_id: 'faqify_pro_monthly',
        amount: 900, // ₹9 in paise
        faq_limit: 100
      },
      'Business': {
        razorpay_plan_id: 'faqify_business_monthly',
        amount: 2900, // ₹29 in paise
        faq_limit: 500
      }
    }

    const selectedPlan = planMapping[planId]

    // Create subscription in Razorpay
    const subscriptionData = {
      plan_id: selectedPlan.razorpay_plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: 12, // 12 months
      start_at: Math.floor(Date.now() / 1000), // Start immediately
      expire_by: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // Expire in 1 year
      notes: {
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        plan_tier: planId,
        faq_limit: selectedPlan.faq_limit.toString(),
        created_via: 'faqify_app'
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
      console.error('Razorpay subscription creation failed:', errorData)
      throw new Error(`Failed to create subscription: ${errorData}`)
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
        amount: selectedPlan.amount,
        currency: 'INR',
        status: 'created',
        plan_tier: planId as any,
        plan_duration: 'monthly',
        payment_type: 'subscription',
        metadata: {
          razorpay_subscription: razorpaySubscription,
          subscription_id: razorpaySubscription.id,
          plan_id: selectedPlan.razorpay_plan_id,
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
        plan_id: selectedPlan.razorpay_plan_id,
        amount: selectedPlan.amount,
        currency: 'INR',
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
