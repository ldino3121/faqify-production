import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const envVars = {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'NOT SET',
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'NOT SET',
      GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') ? 'SET' : 'NOT SET',
      RAZORPAY_KEY_ID: Deno.env.get('RAZORPAY_KEY_ID') ? 'SET' : 'NOT SET',
      RAZORPAY_SECRET_KEY: Deno.env.get('RAZORPAY_SECRET_KEY') ? 'SET' : 'NOT SET',
      RAZORPAY_WEBHOOK_SECRET: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ? 'SET' : 'NOT SET',
    };

    return new Response(JSON.stringify({
      success: true,
      environment: envVars,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to check environment', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
