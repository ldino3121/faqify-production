import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Helper function to get authenticated user or use service role
async function getSupabaseClient(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Always use service role for admin access
  return createClient(supabaseUrl, supabaseServiceKey);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role for admin access
    const supabase = await getSupabaseClient(req);

    // Get user status for darkyellow548@gmail.com
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'darkyellow548@gmail.com')
      .single();

    if (profileError) {
      return new Response(JSON.stringify({ 
        error: 'Profile not found', 
        details: profileError 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get subscription data
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userProfile.id)
      .single();

    // Get payment transactions
    const { data: transactions, error: transError } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userProfile.id)
      .order('created_at', { ascending: false })
      .limit(5);

    return new Response(JSON.stringify({
      success: true,
      user: userProfile,
      subscription: subscription || null,
      subscriptionError: subError,
      recentTransactions: transactions || [],
      transactionError: transError,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Debug error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
