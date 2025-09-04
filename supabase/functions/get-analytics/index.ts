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
    const timeframe = url.searchParams.get('timeframe') || '30d'; // 7d, 30d, 90d
    const collectionId = url.searchParams.get('collection_id');
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Authorization header is required' 
      }), {
        status: 401,
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

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get analytics data
    const analytics = await getAnalyticsData(supabase, user.id, startDateStr, endDateStr, collectionId);

    return new Response(JSON.stringify(analytics), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-analytics function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getAnalyticsData(supabase: any, userId: string, startDate: string, endDate: string, collectionId?: string) {
  try {
    // Base query for user's collections
    let collectionsQuery = supabase
      .from('faq_collections')
      .select('id, title')
      .eq('user_id', userId);

    if (collectionId) {
      collectionsQuery = collectionsQuery.eq('id', collectionId);
    }

    const { data: collections, error: collectionsError } = await collectionsQuery;
    
    if (collectionsError) throw collectionsError;

    const collectionIds = collections?.map(c => c.id) || [];

    if (collectionIds.length === 0) {
      return {
        overview: {
          totalViews: 0,
          totalClicks: 0,
          totalWidgetLoads: 0,
          totalExports: 0,
          totalCollections: 0,
          totalFAQs: 0
        },
        chartData: [],
        topCollections: [],
        topFAQs: [],
        recentActivity: []
      };
    }

    // Get overview stats
    const overview = await getOverviewStats(supabase, userId, collectionIds, startDate, endDate);
    
    // Get chart data (daily breakdown)
    const chartData = await getChartData(supabase, collectionIds, startDate, endDate);
    
    // Get top performing collections
    const topCollections = await getTopCollections(supabase, collectionIds, startDate, endDate);
    
    // Get top performing FAQs
    const topFAQs = await getTopFAQs(supabase, collectionIds, startDate, endDate);
    
    // Get recent activity
    const recentActivity = await getRecentActivity(supabase, collectionIds, startDate, endDate);

    return {
      overview,
      chartData,
      topCollections,
      topFAQs,
      recentActivity
    };

  } catch (error) {
    console.error('Error getting analytics data:', error);
    throw error;
  }
}

async function getOverviewStats(supabase: any, userId: string, collectionIds: string[], startDate: string, endDate: string) {
  // Get total views and clicks from analytics events
  const { data: eventStats } = await supabase
    .from('analytics_events')
    .select('event_type')
    .in('collection_id', collectionIds)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59');

  const totalViews = eventStats?.filter(e => e.event_type === 'faq_view').length || 0;
  const totalClicks = eventStats?.filter(e => e.event_type === 'faq_click').length || 0;
  const totalWidgetLoads = eventStats?.filter(e => e.event_type === 'widget_load').length || 0;
  const totalExports = eventStats?.filter(e => e.event_type === 'export').length || 0;

  // Get total collections and FAQs
  const { data: collectionsCount } = await supabase
    .from('faq_collections')
    .select('id', { count: 'exact' })
    .eq('user_id', userId);

  const { data: faqsCount } = await supabase
    .from('faqs')
    .select('id', { count: 'exact' })
    .in('collection_id', collectionIds);

  return {
    totalViews,
    totalClicks,
    totalWidgetLoads,
    totalExports,
    totalCollections: collectionsCount?.length || 0,
    totalFAQs: faqsCount?.length || 0
  };
}

async function getChartData(supabase: any, collectionIds: string[], startDate: string, endDate: string) {
  const { data: dailyStats } = await supabase
    .from('analytics_events')
    .select('created_at, event_type')
    .in('collection_id', collectionIds)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .order('created_at');

  // Group by date
  const dailyData: Record<string, { views: number; clicks: number; loads: number }> = {};
  
  dailyStats?.forEach(event => {
    const date = event.created_at.split('T')[0];
    if (!dailyData[date]) {
      dailyData[date] = { views: 0, clicks: 0, loads: 0 };
    }
    
    switch (event.event_type) {
      case 'faq_view':
        dailyData[date].views++;
        break;
      case 'faq_click':
        dailyData[date].clicks++;
        break;
      case 'widget_load':
        dailyData[date].loads++;
        break;
    }
  });

  return Object.entries(dailyData).map(([date, stats]) => ({
    date,
    ...stats
  })).sort((a, b) => a.date.localeCompare(b.date));
}

async function getTopCollections(supabase: any, collectionIds: string[], startDate: string, endDate: string) {
  const { data: collectionStats } = await supabase
    .from('analytics_events')
    .select('collection_id, event_type, faq_collections(title)')
    .in('collection_id', collectionIds)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59');

  const collectionData: Record<string, { title: string; views: number; clicks: number }> = {};
  
  collectionStats?.forEach(event => {
    const id = event.collection_id;
    if (!collectionData[id]) {
      collectionData[id] = { 
        title: event.faq_collections?.title || 'Unknown',
        views: 0, 
        clicks: 0 
      };
    }
    
    if (event.event_type === 'faq_view') collectionData[id].views++;
    if (event.event_type === 'faq_click') collectionData[id].clicks++;
  });

  return Object.entries(collectionData)
    .map(([id, stats]) => ({ id, ...stats }))
    .sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks))
    .slice(0, 5);
}

async function getTopFAQs(supabase: any, collectionIds: string[], startDate: string, endDate: string) {
  const { data: faqStats } = await supabase
    .from('analytics_events')
    .select('faq_id, event_type, faqs(question, faq_collections(title))')
    .in('collection_id', collectionIds)
    .not('faq_id', 'is', null)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59');

  const faqData: Record<string, { question: string; collection: string; views: number; clicks: number }> = {};
  
  faqStats?.forEach(event => {
    const id = event.faq_id;
    if (!faqData[id]) {
      faqData[id] = { 
        question: event.faqs?.question || 'Unknown',
        collection: event.faqs?.faq_collections?.title || 'Unknown',
        views: 0, 
        clicks: 0 
      };
    }
    
    if (event.event_type === 'faq_view') faqData[id].views++;
    if (event.event_type === 'faq_click') faqData[id].clicks++;
  });

  return Object.entries(faqData)
    .map(([id, stats]) => ({ id, ...stats }))
    .sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks))
    .slice(0, 5);
}

async function getRecentActivity(supabase: any, collectionIds: string[], startDate: string, endDate: string) {
  const { data: recentEvents } = await supabase
    .from('analytics_events')
    .select('event_type, created_at, faq_collections(title), faqs(question)')
    .in('collection_id', collectionIds)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .order('created_at', { ascending: false })
    .limit(10);

  return recentEvents?.map(event => ({
    type: event.event_type,
    timestamp: event.created_at,
    collection: event.faq_collections?.title,
    faq: event.faqs?.question
  })) || [];
}
