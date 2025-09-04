import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, planId } = await req.json();
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Authorization header is required' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!action) {
      return new Response(JSON.stringify({ 
        error: 'action is required (cancel, update, portal)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get user from auth header
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired token' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile with subscription info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ 
        error: 'User profile not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Stripe
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured');
    }
    
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    switch (action) {
      case 'cancel': {
        if (!profile.stripe_subscription_id) {
          return new Response(JSON.stringify({ 
            error: 'No active subscription found' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Cancel subscription at period end
        const subscription = await stripe.subscriptions.update(
          profile.stripe_subscription_id,
          { cancel_at_period_end: true }
        );

        // Update local status
        await supabase
          .from('user_profiles')
          .update({
            subscription_status: 'canceled',
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Subscription will be canceled at the end of the current period',
          cancelAt: new Date(subscription.current_period_end * 1000).toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'reactivate': {
        if (!profile.stripe_subscription_id) {
          return new Response(JSON.stringify({ 
            error: 'No subscription found' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Reactivate subscription
        const subscription = await stripe.subscriptions.update(
          profile.stripe_subscription_id,
          { cancel_at_period_end: false }
        );

        // Update local status
        await supabase
          .from('user_profiles')
          .update({
            subscription_status: subscription.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Subscription reactivated successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'portal': {
        if (!profile.stripe_customer_id) {
          return new Response(JSON.stringify({ 
            error: 'No Stripe customer found' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create customer portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${req.headers.get('origin')}/dashboard`,
        });

        return new Response(JSON.stringify({ 
          url: session.url 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update': {
        if (!planId) {
          return new Response(JSON.stringify({ 
            error: 'planId is required for update action' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!profile.stripe_subscription_id) {
          return new Response(JSON.stringify({ 
            error: 'No active subscription found' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get new plan details
        const { data: newPlan, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', planId)
          .single();

        if (planError || !newPlan) {
          return new Response(JSON.stringify({ 
            error: 'Subscription plan not found' 
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get current subscription
        const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        
        // Create new price
        const price = await stripe.prices.create({
          currency: 'usd',
          unit_amount: newPlan.price_monthly * 100,
          recurring: { interval: 'month' },
          product_data: {
            name: `${newPlan.name} Plan`,
          },
        });

        // Update subscription
        const updatedSubscription = await stripe.subscriptions.update(
          profile.stripe_subscription_id,
          {
            items: [{
              id: subscription.items.data[0].id,
              price: price.id,
            }],
            proration_behavior: 'create_prorations',
          }
        );

        // Update local database
        await supabase
          .from('user_profiles')
          .update({
            subscription_plan_id: planId,
            subscription_status: updatedSubscription.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Subscription updated successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: 'Invalid action. Use: cancel, reactivate, portal, or update' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('Error managing subscription:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to manage subscription',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
