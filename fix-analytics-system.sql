-- =====================================================
-- Fix Analytics System - Simplified Approach
-- =====================================================
-- This script removes complex analytics references and implements
-- a simplified analytics system using only the usage_analytics table

-- Phase 1: Drop Orphaned Analytics Functions
-- =====================================================

-- Drop functions that reference non-existent tables
DROP FUNCTION IF EXISTS public.increment_collection_views(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_faq_views(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_widget_loads(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_user_exports(UUID, DATE);
DROP FUNCTION IF EXISTS public.increment_user_embeds(UUID, DATE);

-- Phase 2: Ensure Simple Analytics Table Exists
-- =====================================================

-- Make sure usage_analytics table exists with proper structure
CREATE TABLE IF NOT EXISTS public.usage_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'faq_generated', 'faq_exported', 'widget_embedded', etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_usage_analytics_user_id ON public.usage_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_action ON public.usage_analytics(action);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_created_at ON public.usage_analytics(created_at);

-- Phase 3: Create Simplified Analytics Functions
-- =====================================================

-- Function to track simple analytics events
CREATE OR REPLACE FUNCTION public.track_simple_analytics(
  user_uuid UUID,
  action_type TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO public.usage_analytics (user_id, action, metadata)
  VALUES (user_uuid, action_type, metadata_json);
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE WARNING 'Failed to track analytics: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get basic analytics summary
CREATE OR REPLACE FUNCTION public.get_user_analytics_summary(
  user_uuid UUID,
  days_back INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  start_date TIMESTAMPTZ;
BEGIN
  start_date := NOW() - (days_back || ' days')::INTERVAL;
  
  SELECT jsonb_build_object(
    'total_actions', COUNT(*),
    'faq_generated', COUNT(*) FILTER (WHERE action = 'faq_generated'),
    'faq_exported', COUNT(*) FILTER (WHERE action = 'faq_exported'),
    'widget_embedded', COUNT(*) FILTER (WHERE action = 'widget_embedded'),
    'recent_activity', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'action', action,
          'created_at', created_at,
          'metadata', metadata
        )
      )
      FROM (
        SELECT action, created_at, metadata
        FROM public.usage_analytics
        WHERE user_id = user_uuid
          AND created_at >= start_date
        ORDER BY created_at DESC
        LIMIT 10
      ) recent
    )
  )
  INTO result
  FROM public.usage_analytics
  WHERE user_id = user_uuid
    AND created_at >= start_date;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Phase 4: Enable RLS for Analytics Table
-- =====================================================

-- Enable Row Level Security
ALTER TABLE public.usage_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own analytics" ON public.usage_analytics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics" ON public.usage_analytics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Phase 5: Add Helper Comments
-- =====================================================

COMMENT ON TABLE public.usage_analytics IS 'Simplified analytics tracking - stores basic user actions and events';
COMMENT ON FUNCTION public.track_simple_analytics(UUID, TEXT, JSONB) IS 'Track simple analytics events for users';
COMMENT ON FUNCTION public.get_user_analytics_summary(UUID, INTEGER) IS 'Get basic analytics summary for a user';

-- Phase 6: Cleanup Sample Data (Optional)
-- =====================================================

-- Remove any test analytics data older than 90 days
DELETE FROM public.usage_analytics 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Analytics system simplified successfully
SELECT 'Analytics system simplified successfully!' as status;
