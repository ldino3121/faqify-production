
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types for better data integrity
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'past_due', 'incomplete', 'trialing');
CREATE TYPE public.plan_tier AS ENUM ('Free', 'Pro', 'Business');
CREATE TYPE public.faq_status AS ENUM ('draft', 'published', 'archived');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  company TEXT,
  website TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create subscription plans table
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name plan_tier NOT NULL UNIQUE,
  price_monthly INTEGER NOT NULL DEFAULT 0, -- in cents
  price_yearly INTEGER NOT NULL DEFAULT 0, -- in cents
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  faq_limit INTEGER NOT NULL DEFAULT 5,
  features JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_tier plan_tier NOT NULL DEFAULT 'Free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  is_annual BOOLEAN NOT NULL DEFAULT FALSE,
  faq_usage_current INTEGER NOT NULL DEFAULT 0,
  faq_usage_limit INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create FAQ collections table
CREATE TABLE public.faq_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  source_content TEXT,
  status faq_status NOT NULL DEFAULT 'draft',
  embed_code TEXT,
  styling_options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create individual FAQs table
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES public.faq_collections(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create usage analytics table
CREATE TABLE public.usage_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'faq_generated', 'embed_viewed', etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, price_monthly, price_yearly, faq_limit, features) VALUES
('Free', 0, 0, 5, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Email support"]'),
('Pro', 900, 9700, 100, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority email support"]'),
('Business', 2900, 31300, 500, '["Website URL analysis", "Text content analysis", "Document upload (PDF, DOCX)", "AI-powered FAQ generation", "Embed widget", "WordPress integration", "Analytics dashboard", "Export functionality", "Priority support & phone support"]');

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for user_subscriptions
CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription" ON public.user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service can manage subscriptions" ON public.user_subscriptions
  FOR ALL USING (true);

-- Create RLS policies for faq_collections
CREATE POLICY "Users can manage their own FAQ collections" ON public.faq_collections
  FOR ALL USING (auth.uid() = user_id);

-- Create RLS policies for faqs
CREATE POLICY "Users can manage FAQs in their collections" ON public.faqs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.faq_collections 
      WHERE id = faqs.collection_id AND user_id = auth.uid()
    )
  );

-- Create RLS policies for usage_analytics
CREATE POLICY "Users can view their own analytics" ON public.usage_analytics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert analytics" ON public.usage_analytics
  FOR INSERT WITH CHECK (true);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  INSERT INTO public.user_subscriptions (user_id, plan_tier, faq_usage_limit)
  VALUES (NEW.id, 'Free', 5);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update user subscription usage
CREATE OR REPLACE FUNCTION public.increment_faq_usage(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  usage_limit INTEGER;
BEGIN
  SELECT faq_usage_current, faq_usage_limit 
  INTO current_usage, usage_limit
  FROM public.user_subscriptions 
  WHERE user_id = user_uuid;
  
  IF current_usage >= usage_limit THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.user_subscriptions 
  SET faq_usage_current = faq_usage_current + 1,
      updated_at = NOW()
  WHERE user_id = user_uuid;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to reset monthly usage (for cron job)
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_subscriptions 
  SET faq_usage_current = 0,
      updated_at = NOW()
  WHERE status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer ON public.user_subscriptions(stripe_customer_id);
CREATE INDEX idx_faq_collections_user_id ON public.faq_collections(user_id);
CREATE INDEX idx_faqs_collection_id ON public.faqs(collection_id);
CREATE INDEX idx_usage_analytics_user_id ON public.usage_analytics(user_id);
CREATE INDEX idx_usage_analytics_created_at ON public.usage_analytics(created_at);

-- Enable realtime for key tables
ALTER TABLE public.user_subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.faq_collections REPLICA IDENTITY FULL;
ALTER TABLE public.faqs REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.faq_collections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.faqs;
