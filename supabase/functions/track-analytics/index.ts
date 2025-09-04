import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SimpleAnalyticsEvent {
  event_type: string;
  user_id?: string;
  collection_id?: string;
  faq_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

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
    const eventData: SimpleAnalyticsEvent = await req.json();

    // Initialize Supabase client with service role key for analytics
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate required fields
    if (!eventData.event_type) {
      return new Response(JSON.stringify({
        error: 'event_type is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📊 Tracking simple analytics event:', {
      event_type: eventData.event_type,
      user_id: eventData.user_id,
      collection_id: eventData.collection_id
    });

    // Use simplified analytics tracking
    if (eventData.user_id) {
      const { error: trackError } = await supabase.rpc('track_simple_analytics', {
        user_uuid: eventData.user_id,
        action_type: eventData.event_type,
        metadata_json: {
          collection_id: eventData.collection_id || null,
          faq_id: eventData.faq_id || null,
          session_id: eventData.session_id || null,
          user_agent: req.headers.get('user-agent') || null,
          referrer: req.headers.get('referer') || null,
          timestamp: new Date().toISOString(),
          ...eventData.metadata
        }
      });

      if (trackError) {
        console.error('❌ Error tracking analytics:', trackError);
        // Don't fail the request for analytics errors
      } else {
        console.log('✅ Analytics tracked successfully');
      }
    } else {
      console.log('⚠️ No user_id provided, skipping analytics tracking');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Event tracked successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in track-analytics function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Analytics tracking failed',
      details: error.message
    }), {
      status: 200, // Don't fail the main request for analytics issues
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function updateAggregatedAnalytics(supabase: any, eventData: AnalyticsEvent) {
  try {
    const today = new Date().toISOString().split('T')[0];

    switch (eventData.event_type) {
      case 'faq_view':
      case 'faq_click':
        if (eventData.collection_id) {
          // Update collection view count
          await supabase.rpc('increment_collection_views', {
            collection_id: eventData.collection_id,
            date_key: today
          });
        }
        
        if (eventData.faq_id) {
          // Update FAQ view count
          await supabase.rpc('increment_faq_views', {
            faq_id: eventData.faq_id,
            date_key: today
          });
        }
        break;

      case 'widget_load':
        if (eventData.collection_id) {
          // Update widget load count
          await supabase.rpc('increment_widget_loads', {
            collection_id: eventData.collection_id,
            date_key: today
          });
        }
        break;

      case 'export':
        if (eventData.user_id) {
          // Update user export count
          await supabase.rpc('increment_user_exports', {
            user_id: eventData.user_id,
            date_key: today
          });
        }
        break;

      case 'embed_generate':
        if (eventData.user_id) {
          // Update user embed generation count
          await supabase.rpc('increment_user_embeds', {
            user_id: eventData.user_id,
            date_key: today
          });
        }
        break;
    }
  } catch (error) {
    console.error('Error updating aggregated analytics:', error);
    // Don't throw error here to avoid failing the main tracking
  }
}

// Helper function to create database functions (run this once during setup)
async function createAnalyticsFunctions(supabase: any) {
  const functions = [
    `
    CREATE OR REPLACE FUNCTION increment_collection_views(collection_id UUID, date_key DATE)
    RETURNS void AS $$
    BEGIN
      INSERT INTO collection_analytics (collection_id, date, views, created_at, updated_at)
      VALUES (collection_id, date_key, 1, NOW(), NOW())
      ON CONFLICT (collection_id, date)
      DO UPDATE SET views = collection_analytics.views + 1, updated_at = NOW();
    END;
    $$ LANGUAGE plpgsql;
    `,
    `
    CREATE OR REPLACE FUNCTION increment_faq_views(faq_id UUID, date_key DATE)
    RETURNS void AS $$
    BEGIN
      INSERT INTO faq_analytics (faq_id, date, views, created_at, updated_at)
      VALUES (faq_id, date_key, 1, NOW(), NOW())
      ON CONFLICT (faq_id, date)
      DO UPDATE SET views = faq_analytics.views + 1, updated_at = NOW();
    END;
    $$ LANGUAGE plpgsql;
    `,
    `
    CREATE OR REPLACE FUNCTION increment_widget_loads(collection_id UUID, date_key DATE)
    RETURNS void AS $$
    BEGIN
      INSERT INTO collection_analytics (collection_id, date, widget_loads, created_at, updated_at)
      VALUES (collection_id, date_key, 1, NOW(), NOW())
      ON CONFLICT (collection_id, date)
      DO UPDATE SET widget_loads = collection_analytics.widget_loads + 1, updated_at = NOW();
    END;
    $$ LANGUAGE plpgsql;
    `,
    `
    CREATE OR REPLACE FUNCTION increment_user_exports(user_id UUID, date_key DATE)
    RETURNS void AS $$
    BEGIN
      INSERT INTO user_analytics (user_id, date, exports, created_at, updated_at)
      VALUES (user_id, date_key, 1, NOW(), NOW())
      ON CONFLICT (user_id, date)
      DO UPDATE SET exports = user_analytics.exports + 1, updated_at = NOW();
    END;
    $$ LANGUAGE plpgsql;
    `,
    `
    CREATE OR REPLACE FUNCTION increment_user_embeds(user_id UUID, date_key DATE)
    RETURNS void AS $$
    BEGIN
      INSERT INTO user_analytics (user_id, date, embeds_generated, created_at, updated_at)
      VALUES (user_id, date_key, 1, NOW(), NOW())
      ON CONFLICT (user_id, date)
      DO UPDATE SET embeds_generated = user_analytics.embeds_generated + 1, updated_at = NOW();
    END;
    $$ LANGUAGE plpgsql;
    `
  ];

  for (const func of functions) {
    try {
      await supabase.rpc('exec_sql', { sql: func });
    } catch (error) {
      console.error('Error creating function:', error);
    }
  }
}
