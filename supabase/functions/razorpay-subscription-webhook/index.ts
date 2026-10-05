import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { resolveUserEmail, sendEmail } from "../_shared/email.ts"
import { paymentFailedEmail, subscriptionCancelledEmail } from "../_shared/email-templates.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured')
    }

    // Get webhook signature
    const signature = req.headers.get('x-razorpay-signature')
    if (!signature) {
      throw new Error('Missing webhook signature')
    }

    // Get request body
    const body = await req.text()
    
    // Verify webhook signature
    const expectedSignature = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ).then(key => 
      crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    ).then(signature => 
      Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    )

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature')
      throw new Error('Invalid webhook signature')
    }

    const event = JSON.parse(body)
    console.log('Received webhook event:', event.event, 'for entity:', event.payload?.subscription?.entity?.id)

    // Handle different subscription events
    switch (event.event) {
      case 'subscription.activated':
        await handleSubscriptionActivated(supabaseClient, event.payload.subscription.entity)
        break
        
      case 'subscription.charged':
        await handleSubscriptionCharged(supabaseClient, event.payload.subscription.entity, event.payload.payment?.entity)
        break
        
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(supabaseClient, event.payload.subscription.entity)
        break
        
      case 'subscription.paused':
        await handleSubscriptionPaused(supabaseClient, event.payload.subscription.entity)
        break
        
      case 'subscription.resumed':
        await handleSubscriptionResumed(supabaseClient, event.payload.subscription.entity)
        break
        
      case 'subscription.pending':
        await handleSubscriptionPending(supabaseClient, event.payload.subscription.entity)
        break
        
      case 'subscription.halted':
        await handleSubscriptionHalted(supabaseClient, event.payload.subscription.entity)
        break
        
      default:
        console.log('Unhandled webhook event:', event.event)
    }

    return new Response(
      JSON.stringify({ success: true, event: event.event }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

async function handleSubscriptionActivated(supabase: any, subscription: any) {
  console.log('Handling subscription activation:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) {
    console.error('No user_id in subscription notes')
    return
  }

  const planTier = subscription.notes?.plan_tier || 'Pro'
  const faqLimit = parseInt(subscription.notes?.faq_limit || '100')
  
  const now = new Date()
  const nextBilling = new Date(subscription.current_end * 1000)

  // Update user subscription
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_tier: planTier,
      status: 'active',
      plan_activated_at: now.toISOString(),
      plan_expires_at: nextBilling.toISOString(),
      faq_usage_limit: faqLimit,
      // Activation credits the full monthly quota from zero.
      faq_usage_current: 0,
      last_reset_date: now.toISOString(),
      auto_renewal: true,
      payment_type: 'recurring',
      billing_cycle: 'monthly',
      subscription_source: 'razorpay',
      next_billing_date: nextBilling.toISOString(),
      razorpay_subscription_id: subscription.id,
      updated_at: now.toISOString()
    })

  if (error) {
    console.error('Error updating subscription:', error)
    throw error
  }

  console.log('Subscription activated successfully for user:', userId)
}

async function handleSubscriptionCharged(supabase: any, subscription: any, payment: any) {
  console.log('Handling subscription charge:', subscription.id, 'payment:', payment?.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  // Update payment transaction
  if (payment) {
    await supabase
      .from('payment_transactions')
      .update({
        razorpay_payment_id: payment.id,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('razorpay_subscription_id', subscription.id)
  }

  // Extend subscription period
  const nextBilling = new Date(subscription.current_end * 1000)
  
  await supabase
    .from('user_subscriptions')
    .update({
      plan_expires_at: nextBilling.toISOString(),
      next_billing_date: nextBilling.toISOString(),
      status: 'active',
      // Renewal paid -> fresh monthly quota for the new billing cycle.
      faq_usage_current: 0,
      last_reset_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  console.log('Subscription charged and extended for user:', userId)
}

async function handleSubscriptionCancelled(supabase: any, subscription: any) {
  console.log('Handling subscription cancellation:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  await supabase
    .from('user_subscriptions')
    .update({
      auto_renewal: false,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Cancelled via Razorpay',
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  console.log('Subscription cancelled for user:', userId)
}

async function handleSubscriptionPaused(supabase: any, subscription: any) {
  console.log('Handling subscription pause:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  await supabase
    .from('user_subscriptions')
    .update({
      status: 'paused',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
}

async function handleSubscriptionResumed(supabase: any, subscription: any) {
  console.log('Handling subscription resume:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  await supabase
    .from('user_subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
}

async function handleSubscriptionPending(supabase: any, subscription: any) {
  console.log('Handling subscription pending:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  await supabase
    .from('user_subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  // Dunning: tell the customer their renewal failed before access is revoked.
  await deliverPastDueNotice(supabase, subscription)
}

async function handleSubscriptionHalted(supabase: any, subscription: any) {
  console.log('Handling subscription halt:', subscription.id)
  
  const userId = subscription.notes?.user_id
  if (!userId) return

  await supabase
    .from('user_subscriptions')
    .update({
      status: 'cancelled',
      auto_renewal: false,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  // Final retry failed: advise the customer their plan has stopped.
  await deliverHaltedNotice(supabase, subscription)
}

/* --------------------------------------------------------- transactional email
 * Only `subscription.pending` and `subscription.halted` are emailed from this
 * function. Activated / charged / cancelled are handled by razorpay-webhook so
 * the same customer never receives two copies of one notice.
 * sendEmail never throws and is a no-op until RESEND_API_KEY is set.
 */

async function deliverPastDueNotice(supabase: any, subscription: any) {
  try {
    const userId = subscription?.notes?.user_id
    if (!userId) return

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan_tier')
      .eq('user_id', userId)
      .maybeSingle()

    const { email, name } = await resolveUserEmail(supabase, userId)
    if (!email) return

    await sendEmail({
      to: email,
      ...paymentFailedEmail({
        name,
        planTier: String(sub?.plan_tier ?? 'Pro'),
        reason: 'Your automatic renewal could not be collected.',
      }),
    })
  } catch (err) {
    console.error('[email] dunning notice failed', err)
  }
}

async function deliverHaltedNotice(supabase: any, subscription: any) {
  try {
    const userId = subscription?.notes?.user_id
    if (!userId) return

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan_tier, plan_expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    const { email, name } = await resolveUserEmail(supabase, userId)
    if (!email) return

    const until = sub?.plan_expires_at
      ? new Date(sub.plan_expires_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null

    await sendEmail({
      to: email,
      ...subscriptionCancelledEmail({
        name,
        planTier: String(sub?.plan_tier ?? 'Pro'),
        untilLabel: until,
      }),
    })
  } catch (err) {
    console.error('[email] halted notice failed', err)
  }
}
