import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManageSubscriptionRequest {
  action: 'pause' | 'resume' | 'cancel' | 'update' | 'get_details';
  subscription_id?: string;
  reason?: string;
  immediate?: boolean;
  new_plan?: 'Pro' | 'Business';
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

    const { action, subscription_id, reason, immediate, new_plan }: ManageSubscriptionRequest = await req.json()

    // Razorpay configuration
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured')
    }

    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)

    // Get user's current subscription from database
    const { data: userSubscription, error: subError } = await supabaseClient
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (subError || !userSubscription) {
      throw new Error('No active subscription found')
    }

    const razorpaySubscriptionId = subscription_id || userSubscription.razorpay_subscription_id

    if (!razorpaySubscriptionId) {
      throw new Error('No Razorpay subscription ID found')
    }

    let result: any = {}

    switch (action) {
      case 'get_details': {
        // Get subscription details from Razorpay
        const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          }
        })

        const subscriptionData = await response.json()

        if (!response.ok) {
          throw new Error(`Failed to fetch subscription: ${subscriptionData.error?.description || 'Unknown error'}`)
        }

        result = {
          success: true,
          subscription: subscriptionData,
          local_data: userSubscription
        }
        break
      }

      case 'pause': {
        // Pause subscription
        const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}/pause`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pause_at: immediate ? 'now' : 'cycle_end'
          })
        })

        const pauseData = await response.json()

        if (!response.ok) {
          throw new Error(`Failed to pause subscription: ${pauseData.error?.description || 'Unknown error'}`)
        }

        // Update local database
        await supabaseClient
          .from('user_subscriptions')
          .update({
            status: 'paused',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)

        result = {
          success: true,
          message: 'Subscription paused successfully',
          subscription: pauseData
        }
        break
      }

      case 'resume': {
        // Resume subscription
        const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}/resume`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resume_at: 'now'
          })
        })

        const resumeData = await response.json()

        if (!response.ok) {
          throw new Error(`Failed to resume subscription: ${resumeData.error?.description || 'Unknown error'}`)
        }

        // Update local database
        await supabaseClient
          .from('user_subscriptions')
          .update({
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)

        result = {
          success: true,
          message: 'Subscription resumed successfully',
          subscription: resumeData
        }
        break
      }

      case 'cancel': {
        // Cancel subscription
        const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpaySubscriptionId}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cancel_at_cycle_end: !immediate
          })
        })

        const cancelData = await response.json()

        if (!response.ok) {
          throw new Error(`Failed to cancel subscription: ${cancelData.error?.description || 'Unknown error'}`)
        }

        // Update local database
        const updateData: any = {
          auto_renewal: false,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'User requested cancellation',
          updated_at: new Date().toISOString()
        }

        if (immediate) {
          updateData.status = 'canceled'
          updateData.plan_expires_at = new Date().toISOString()
        }

        await supabaseClient
          .from('user_subscriptions')
          .update(updateData)
          .eq('user_id', user.id)

        // Log cancellation
        await supabaseClient
          .from('subscription_cancellations')
          .insert({
            user_id: user.id,
            subscription_id: userSubscription.id,
            cancelled_at: new Date().toISOString(),
            cancellation_reason: reason || 'User requested cancellation',
            effective_date: immediate ? new Date().toISOString() : userSubscription.plan_expires_at,
            cancelled_by: 'user'
          })

        result = {
          success: true,
          message: immediate ? 'Subscription cancelled immediately' : 'Subscription will be cancelled at the end of current billing period',
          subscription: cancelData,
          effective_date: immediate ? new Date().toISOString() : userSubscription.plan_expires_at
        }
        break
      }

      case 'update': {
        if (!new_plan) {
          throw new Error('New plan is required for update action')
        }

        // This would require creating a new subscription and cancelling the old one
        // Razorpay doesn't support direct plan changes
        result = {
          success: false,
          message: 'Plan updates require creating a new subscription. Please cancel current subscription and create a new one.',
          requires_new_subscription: true
        }
        break
      }

      default:
        throw new Error(`Invalid action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error managing Razorpay subscription:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
