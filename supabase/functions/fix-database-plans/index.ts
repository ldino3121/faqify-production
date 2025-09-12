import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🔧 Starting database plan fix...')

    // Step 1: Check current plans
    const { data: currentPlans, error: fetchError } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .order('price_monthly')

    if (fetchError) {
      throw new Error(`Failed to fetch plans: ${fetchError.message}`)
    }

    console.log('📊 Current plans:', currentPlans)

    // Step 2: Add missing columns if they don't exist
    console.log('🔧 Adding missing columns...')
    
    try {
      await supabaseAdmin.rpc('exec_sql', {
        sql: `
          ALTER TABLE public.subscription_plans
          ADD COLUMN IF NOT EXISTS razorpay_plan_id_inr TEXT;
          
          ALTER TABLE public.user_subscriptions
          ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
        `
      })
    } catch (error) {
      console.log('Column addition error (might already exist):', error.message)
    }

    // Step 3: Update Pro Plan
    console.log('🔧 Updating Pro plan...')
    const { error: proError } = await supabaseAdmin
      .from('subscription_plans')
      .update({
        razorpay_plan_id_inr: 'plan_RGcv1a3WtevwV8',
        price_inr: 75000,
        price_monthly: 750
      })
      .eq('name', 'Pro')

    if (proError) {
      console.error('Pro plan update error:', proError)
    } else {
      console.log('✅ Pro plan updated successfully')
    }

    // Step 4: Update Business Plan
    console.log('🔧 Updating Business plan...')
    const { error: businessError } = await supabaseAdmin
      .from('subscription_plans')
      .update({
        razorpay_plan_id_inr: 'plan_RGcucvclIXXAgp',
        price_inr: 250000,
        price_monthly: 2500
      })
      .eq('name', 'Business')

    if (businessError) {
      console.error('Business plan update error:', businessError)
    } else {
      console.log('✅ Business plan updated successfully')
    }

    // Step 5: Update Free Plan
    console.log('🔧 Updating Free plan...')
    const { error: freeError } = await supabaseAdmin
      .from('subscription_plans')
      .update({
        faq_limit: 10,
        price_monthly: 0,
        price_inr: 0
      })
      .eq('name', 'Free')

    if (freeError) {
      console.error('Free plan update error:', freeError)
    } else {
      console.log('✅ Free plan updated successfully')
    }

    // Step 6: Update existing Free plan users
    console.log('🔧 Updating existing Free plan users...')
    const { error: userUpdateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        faq_usage_limit: 10
      })
      .eq('plan_tier', 'Free')

    if (userUpdateError) {
      console.error('User update error:', userUpdateError)
    } else {
      console.log('✅ Free plan users updated successfully')
    }

    // Step 7: Verify the updates
    const { data: updatedPlans, error: verifyError } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .order('price_monthly')

    if (verifyError) {
      throw new Error(`Failed to verify updates: ${verifyError.message}`)
    }

    console.log('📊 Updated plans:', updatedPlans)

    // Check if updates were successful
    const proPlan = updatedPlans.find(p => p.name === 'Pro')
    const businessPlan = updatedPlans.find(p => p.name === 'Business')
    const freePlan = updatedPlans.find(p => p.name === 'Free')

    const results = {
      success: true,
      message: 'Database plans updated successfully',
      plans: updatedPlans,
      verification: {
        pro_plan_id_correct: proPlan?.razorpay_plan_id_inr === 'plan_RGcv1a3WtevwV8',
        business_plan_id_correct: businessPlan?.razorpay_plan_id_inr === 'plan_RGcucvclIXXAgp',
        pro_price_correct: proPlan?.price_monthly === 750,
        business_price_correct: businessPlan?.price_monthly === 2500,
        free_limit_correct: freePlan?.faq_limit === 10
      }
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Database fix error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.stack 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
