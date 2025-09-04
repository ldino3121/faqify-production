import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🔄 Applying pricing migration...')

    // Update subscription plans with new pricing structure
    const planUpdates = [
      {
        name: 'Free',
        price_monthly: 0,
        price_yearly: 0,
        faq_limit: 5,
        features: [
          "Website URL analysis",
          "Text content analysis",
          "Document upload (PDF, DOCX)",
          "AI-powered FAQ generation",
          "Embed widget",
          "WordPress integration",
          "Analytics dashboard",
          "Export functionality",
          "Email support"
        ]
      },
      {
        name: 'Pro',
        price_monthly: 900, // $9.00 in cents
        price_yearly: 9700, // $97.00 in cents (10% discount)
        faq_limit: 100,
        features: [
          "Website URL analysis",
          "Text content analysis",
          "Document upload (PDF, DOCX)",
          "AI-powered FAQ generation",
          "Embed widget",
          "WordPress integration",
          "Analytics dashboard",
          "Export functionality",
          "Priority email support"
        ]
      },
      {
        name: 'Business',
        price_monthly: 2900, // $29.00 in cents
        price_yearly: 31300, // $313.00 in cents (10% discount)
        faq_limit: 500,
        features: [
          "Website URL analysis",
          "Text content analysis",
          "Document upload (PDF, DOCX)",
          "AI-powered FAQ generation",
          "Embed widget",
          "WordPress integration",
          "Analytics dashboard",
          "Export functionality",
          "Priority support & phone support"
        ]
      }
    ]

    // Update each plan
    for (const plan of planUpdates) {
      const { error: planError } = await supabase
        .from('subscription_plans')
        .upsert(plan, { onConflict: 'name' })

      if (planError) {
        console.error(`Error updating ${plan.name} plan:`, planError)
        throw planError
      }
      console.log(`✅ Updated ${plan.name} plan`)
    }

    // Update existing user subscriptions to match new limits
    const userUpdates = [
      { plan_tier: 'Free', faq_usage_limit: 5 },
      { plan_tier: 'Pro', faq_usage_limit: 100 },
      { plan_tier: 'Business', faq_usage_limit: 500 }
    ]

    for (const update of userUpdates) {
      const { error: userError } = await supabase
        .from('user_subscriptions')
        .update({ faq_usage_limit: update.faq_usage_limit })
        .eq('plan_tier', update.plan_tier)

      if (userError) {
        console.error(`Error updating ${update.plan_tier} users:`, userError)
        throw userError
      }
      console.log(`✅ Updated ${update.plan_tier} users`)
    }

    // Update the handle_new_user function
    const { error: functionError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS TRIGGER AS $$
        BEGIN
          INSERT INTO public.profiles (id, email, full_name)
          VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
          );
          
          INSERT INTO public.user_subscriptions (user_id, plan_tier, faq_usage_limit, last_reset_date)
          VALUES (NEW.id, 'Free', 5, CURRENT_DATE);
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `
    })

    if (functionError) {
      console.warn('Function update failed, but continuing...', functionError)
    } else {
      console.log('✅ Updated new user signup function')
    }

    console.log('🎉 Pricing migration completed successfully!')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Pricing migration applied successfully',
        plans: planUpdates.map(p => ({ name: p.name, faq_limit: p.faq_limit }))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Migration error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
