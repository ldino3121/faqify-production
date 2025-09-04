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
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the target email from request body
    const { email } = await req.json()
    
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Assigning Pro plan to: ${email}`)

    // Find user by email in auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('Error fetching auth users:', authError)
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUser = authUsers.users.find(user => user.email === email)
    
    if (!targetUser) {
      return new Response(JSON.stringify({ error: `User with email ${email} not found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found user: ${targetUser.id}`)

    // Step 1: Ensure profile exists
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', targetUser.id)
      .single()

    if (profileCheckError && profileCheckError.code === 'PGRST116') {
      // Profile doesn't exist, create it
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: targetUser.id,
          email: targetUser.email || email,
          full_name: targetUser.user_metadata?.full_name || 'FAQify User'
        })

      if (createProfileError) {
        console.error('Error creating profile:', createProfileError)
        return new Response(JSON.stringify({ error: 'Failed to create profile' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log('Profile created successfully')
    } else if (profileCheckError) {
      console.error('Error checking profile:', profileCheckError)
      return new Response(JSON.stringify({ error: 'Failed to check profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Handle subscription
    const { data: existingSub, error: subCheckError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', targetUser.id)
      .single()

    const proSubscriptionData = {
      user_id: targetUser.id,
      plan_tier: 'Pro',
      faq_usage_limit: 100,
      faq_usage_current: 0,
      status: 'active',
      plan_activated_at: new Date().toISOString(),
      plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_reset_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    }

    if (subCheckError && subCheckError.code === 'PGRST116') {
      // Subscription doesn't exist, create Pro subscription
      const { error: createSubError } = await supabase
        .from('user_subscriptions')
        .insert(proSubscriptionData)

      if (createSubError) {
        console.error('Error creating subscription:', createSubError)
        return new Response(JSON.stringify({ error: 'Failed to create Pro subscription' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log('Pro subscription created successfully')
    } else if (subCheckError) {
      console.error('Error checking subscription:', subCheckError)
      return new Response(JSON.stringify({ error: 'Failed to check subscription' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Subscription exists, update to Pro
      const { error: updateSubError } = await supabase
        .from('user_subscriptions')
        .update(proSubscriptionData)
        .eq('user_id', targetUser.id)

      if (updateSubError) {
        console.error('Error updating subscription:', updateSubError)
        return new Response(JSON.stringify({ error: 'Failed to update to Pro subscription' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log('Subscription updated to Pro successfully')
    }

    // Step 3: Verify the changes
    const { data: finalSub, error: verifyError } = await supabase
      .from('user_subscriptions')
      .select('plan_tier, faq_usage_current, faq_usage_limit, status')
      .eq('user_id', targetUser.id)
      .single()

    if (verifyError) {
      console.error('Error verifying subscription:', verifyError)
      return new Response(JSON.stringify({ error: 'Failed to verify Pro plan assignment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Pro plan assignment verified:', finalSub)

    return new Response(JSON.stringify({
      success: true,
      message: `Pro plan assigned successfully to ${email}`,
      subscription: finalSub
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
