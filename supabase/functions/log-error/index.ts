import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { error, context, userId, timestamp } = await req.json();

    console.log('🚨 ERROR LOG RECEIVED:', {
      error,
      context,
      userId,
      timestamp: timestamp || new Date().toISOString(),
      userAgent: req.headers.get('user-agent'),
      origin: req.headers.get('origin'),
    });

    // Log to Supabase for debugging
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Insert error log into database
      const { error: dbError } = await supabase
        .from('error_logs')
        .insert({
          user_id: userId,
          error_message: error.message,
          error_stack: error.stack,
          error_context: context,
          timestamp: timestamp || new Date().toISOString(),
          user_agent: req.headers.get('user-agent'),
          origin: req.headers.get('origin'),
        });

      if (dbError) {
        console.error('Failed to log error to database:', dbError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Error logged successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in log-error function:', error);
    return new Response(JSON.stringify({
      error: true,
      message: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

