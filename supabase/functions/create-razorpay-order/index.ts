import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RazorpayOrderRequest {
  planId: string;
  currency?: string;
  userCountry?: string;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
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
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpaySecret = Deno.env.get('RAZORPAY_SECRET_KEY');

    console.log('Environment check:', {
      hasKeyId: !!razorpayKeyId,
      hasSecret: !!razorpaySecret,
      keyIdLength: razorpayKeyId?.length || 0,
      allEnvVars: Object.keys(Deno.env.toObject()).filter(key => key.includes('RAZOR'))
    });

    if (!razorpayKeyId || !razorpaySecret) {
      console.error('Missing Razorpay credentials. Available env vars:', Object.keys(Deno.env.toObject()));
      return new Response(JSON.stringify({
        error: 'Razorpay configuration missing',
        details: 'Please configure RAZORPAY_KEY_ID and RAZORPAY_SECRET_KEY in Supabase Edge Functions secrets',
        hasKeyId: !!razorpayKeyId,
        hasSecret: !!razorpaySecret,
        availableEnvVars: Object.keys(Deno.env.toObject()).filter(key => key.includes('RAZOR'))
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    const { planId, currency = 'inr', userCountry = 'IN' }: RazorpayOrderRequest = await req.json();

    console.log('Request details:', {
      planId,
      currency,
      userCountry,
      userId: user.id
    });

    if (!planId) {
      return new Response(JSON.stringify({ error: 'Plan ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get plan details - try both name and case variations
    let plan, planError;

    // First try exact match
    const { data: exactPlan, error: exactError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', planId)
      .single();

    if (exactPlan) {
      plan = exactPlan;
      planError = null;
    } else {
      // Try case-insensitive match
      const { data: allPlans, error: allError } = await supabase
        .from('subscription_plans')
        .select('*');

      if (!allError && allPlans) {
        plan = allPlans.find(p => p.name.toLowerCase() === planId.toLowerCase());
        planError = plan ? null : { message: 'Plan not found' };
      } else {
        planError = allError;
      }
    }

    console.log('Plan lookup result:', {
      planId,
      foundPlan: !!plan,
      planName: plan?.name,
      error: planError?.message
    });

    if (planError || !plan) {
      // Get all available plans for debugging
      const { data: allPlans } = await supabase
        .from('subscription_plans')
        .select('name');

      console.error('Plan not found. Available plans:', allPlans?.map(p => p.name));

      return new Response(JSON.stringify({
        error: 'Plan not found',
        requestedPlan: planId,
        availablePlans: allPlans?.map(p => p.name) || [],
        details: planError?.message || 'Plan does not exist'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine currency and amount based on user location
    const targetCurrency = currency.toLowerCase();
    let amount: number;

    switch (targetCurrency) {
      case 'inr':
        amount = plan.price_inr || plan.price_monthly * 83; // Fallback conversion
        break;
      case 'eur':
        amount = plan.price_eur || Math.round(plan.price_monthly * 0.85);
        break;
      case 'gbp':
        amount = plan.price_gbp || Math.round(plan.price_monthly * 0.75);
        break;
      case 'usd':
      default:
        amount = plan.price_monthly;
        break;
    }

    if (amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid plan amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Razorpay order
    const orderData = {
      amount: amount, // Amount in smallest currency unit
      currency: targetCurrency.toUpperCase(),
      receipt: `order_${user.id}_${Date.now()}`,
      notes: {
        user_id: user.id,
        plan_id: planId,
        user_email: profile.email,
        plan_name: plan.name
      }
    };

    console.log('Creating Razorpay order:', orderData);

    // Make request to Razorpay API
    console.log('Making Razorpay API request...');

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    console.log('Razorpay API response status:', razorpayResponse.status);

    if (!razorpayResponse.ok) {
      const errorText = await razorpayResponse.text();
      console.error('Razorpay API error:', {
        status: razorpayResponse.status,
        statusText: razorpayResponse.statusText,
        error: errorText
      });

      return new Response(JSON.stringify({
        error: 'Razorpay API error',
        details: `HTTP ${razorpayResponse.status}: ${errorText}`,
        status: razorpayResponse.status
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const razorpayOrder: RazorpayOrderResponse = await razorpayResponse.json();
    console.log('Razorpay order created successfully:', {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });

    // Store transaction record
    const { error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: user.id,
        subscription_id: (await supabase
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .single()
        ).data?.id,
        payment_gateway: 'razorpay',
        transaction_type: 'subscription',
        razorpay_order_id: razorpayOrder.id,
        amount: amount,
        currency: targetCurrency,
        status: 'pending',
        plan_tier: planId as any,
        plan_duration: 'monthly',
        metadata: {
          razorpay_order: razorpayOrder,
          user_country: userCountry
        }
      });

    if (transactionError) {
      console.error('Error storing transaction:', transactionError);
      // Don't fail the request, just log the error
    }

    // Return order details for frontend
    return new Response(JSON.stringify({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: razorpayKeyId, // Frontend needs this for Razorpay checkout
      },
      plan: {
        id: planId,
        name: plan.name,
        amount: amount,
        currency: targetCurrency
      },
      user: {
        id: user.id,
        email: profile.email,
        name: profile.full_name || profile.email
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create payment order',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
