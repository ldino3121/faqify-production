import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const collectionId = url.searchParams.get('collection_id');
    const widgetId = url.searchParams.get('widget_id');
    
    if (!collectionId && !widgetId) {
      return new Response(JSON.stringify({ 
        error: 'collection_id or widget_id parameter is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query for the FAQ collection and its FAQs
    const { data: collection, error } = await supabase
      .from('faq_collections')
      .select(`
        id,
        title,
        description,
        status,
        styling_options,
        faqs (
          id,
          question,
          answer,
          order_index,
          is_published
        )
      `)
      .eq('id', collectionId || widgetId)
      .eq('status', 'published')
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ 
        error: 'FAQ collection not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!collection) {
      return new Response(JSON.stringify({ 
        error: 'FAQ collection not found or not published' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter only published FAQs and sort by order_index
    const publishedFAQs = (collection.faqs || [])
      .filter(faq => faq.is_published)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    // Prepare response data
    const responseData = {
      id: collection.id,
      title: collection.title,
      description: collection.description,
      styling_options: collection.styling_options || {},
      faqs: publishedFAQs.map(faq => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        order_index: faq.order_index
      }))
    };

    return new Response(JSON.stringify(responseData), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      },
    });

  } catch (error) {
    console.error('Error in get-faq-widget function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
