import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
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
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!stripeKey || !webhookSecret) {
      throw new Error('Stripe configuration missing');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      throw new Error('Missing Stripe signature');
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Webhook signature verification failed', { status: 400 });
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Processing webhook event:', event.type);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.mode === 'subscription') {
          const userId = session.metadata?.user_id;
          const planId = session.metadata?.plan_id;
          
          if (!userId || !planId) {
            console.error('Missing metadata in checkout session');
            break;
          }

          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          // Update user subscription in database
          const { error } = await supabase
            .from('user_profiles')
            .update({
              subscription_plan_id: planId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscription.id,
              subscription_status: subscription.status,
              subscription_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (error) {
            console.error('Error updating user subscription:', error);
          } else {
            console.log('Successfully updated user subscription for user:', userId);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: user, error: userError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userError || !user) {
          console.error('User not found for customer:', customerId);
          break;
        }

        // Update subscription status
        const { error } = await supabase
          .from('user_profiles')
          .update({
            subscription_status: subscription.status,
            subscription_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) {
          console.error('Error updating subscription status:', error);
        } else {
          console.log('Successfully updated subscription status for user:', user.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { data: user, error: userError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userError || !user) {
          console.error('User not found for customer:', customerId);
          break;
        }

        // Reset to free plan
        const { data: freePlan } = await supabase
          .from('subscription_plans')
          .select('id')
          .eq('name', 'Free')
          .single();

        const { error } = await supabase
          .from('user_profiles')
          .update({
            subscription_plan_id: freePlan?.id || null,
            stripe_subscription_id: null,
            subscription_status: 'canceled',
            subscription_current_period_start: null,
            subscription_current_period_end: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) {
          console.error('Error canceling subscription:', error);
        } else {
          console.log('Successfully canceled subscription for user:', user.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by Stripe customer ID
        const { data: user, error: userError } = await supabase
          .from('user_profiles')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userError || !user) {
          console.error('User not found for customer:', customerId);
          break;
        }

        // Update subscription status to past_due
        const { error } = await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'past_due',
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) {
          console.error('Error updating payment failed status:', error);
        } else {
          console.log('Updated payment failed status for user:', user.id);
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(`Webhook error: ${error.message}`, { status: 400 });
  }
});
