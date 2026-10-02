-- Analytics columns for funnel tracking (P1-10). Safe to re-run.

BEGIN;

ALTER TABLE public.usage_analytics
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_usage_analytics_user_action_created
  ON public.usage_analytics (user_id, action, created_at DESC);

COMMIT;
