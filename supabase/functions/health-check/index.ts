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
    const startTime = Date.now();
    const checks = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime?.() || 'N/A',
      checks: {} as Record<string, any>
    };

    // Check Gemini API
    try {
      const geminiKey = Deno.env.get('GEMINI_API_KEY') || 
                       Deno.env.get('GOOGLE_AI_API_KEY') ||
                       Deno.env.get('GOOGLE_GEMINI_API_KEY');
      
      checks.checks.gemini_api = {
        status: geminiKey ? 'configured' : 'missing',
        hasKey: !!geminiKey,
        keyLength: geminiKey?.length || 0,
        keyPreview: geminiKey ? `${geminiKey.substring(0, 12)}...` : 'none'
      };
    } catch (e) {
      checks.checks.gemini_api = { status: 'error', message: e.message };
    }

    // Check Supabase connection
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      checks.checks.supabase = {
        status: (supabaseUrl && supabaseKey) ? 'configured' : 'missing',
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey
      };
    } catch (e) {
      checks.checks.supabase = { status: 'error', message: e.message };
    }

    // Check environment variables
    checks.checks.environment = {
      hasGeminiKey: !!Deno.env.get('GEMINI_API_KEY'),
      hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
      hasSupabaseKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      environment: Deno.env.get('ENVIRONMENT') || 'production'
    };

    const responseTime = Date.now() - startTime;
    checks.checks.response_time_ms = responseTime;

    return new Response(JSON.stringify({
      status: 'healthy',
      ...checks
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

