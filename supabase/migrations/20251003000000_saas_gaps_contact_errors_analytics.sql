-- ============================================================================
-- Remediate three live-SaaS gaps found in the October 2026 audit:
--
--   1. public.contact_messages — durable store for support requests so a
--      submission is never lost when the mail provider is unavailable.
--
--   2. public.error_logs — referenced by supabase/functions/log-error but the
--      table never existed, so every production error was dropped on the floor.
--
--   3. public.track_simple_analytics() — referenced by supabase/functions/
--      track-analytics but never created, so funnel analytics had been failing
--      silently since deployment.
--
-- Applied via `supabase db query --linked -f <file>` (NOT `db push`).
-- ============================================================================

-- 1) ------------------------------------------------------------ contacts ---
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  subject    text NOT NULL DEFAULT 'General enquiry',
  message    text NOT NULL,
  origin     text,
  user_agent text,
  ip_hash    text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_messages_email_chk
    CHECK (position('@' in email) > 1 AND char_length(email) <= 254),
  CONSTRAINT contact_messages_message_chk
    CHECK (char_length(message) BETWEEN 10 AND 5000),
  CONSTRAINT contact_messages_name_chk
    CHECK (char_length(name) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS ix_contact_messages_created
  ON public.contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_contact_messages_unreplied
  ON public.contact_messages (replied_at, created_at DESC)
  WHERE replied_at IS NULL;

-- Service-role only: the public endpoint is the edge function, never anon.
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contact_messages TO service_role;

-- 2) ---------------------------------------------------------- error_logs ---
CREATE TABLE IF NOT EXISTS public.error_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  error_message text,
  error_stack   text,
  error_context jsonb,
  user_agent    text,
  origin        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Column name the existing edge function writes to; kept for compatibility.
  "timestamp"   timestamptz
);

CREATE INDEX IF NOT EXISTS ix_error_logs_created
  ON public.error_logs (created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.error_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_logs TO service_role;

-- 3) ------------------------------------------------- analytics tracking ----
-- Signature must match the named arguments used by track-analytics:
--   supabase.rpc('track_simple_analytics', { user_uuid, action_type, metadata_json })
CREATE OR REPLACE FUNCTION public.track_simple_analytics(
  user_uuid     uuid,
  action_type   text,
  metadata_json jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  new_id   uuid;
BEGIN
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'user_uuid is required';
  END IF;

  v_action := left(btrim(coalesce(action_type, '')), 100);
  IF v_action = '' THEN
    RAISE EXCEPTION 'action_type is required';
  END IF;

  INSERT INTO public.usage_analytics (user_id, action_type, metadata)
  VALUES (user_uuid, v_action, coalesce(metadata_json, '{}'::jsonb))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; only the edge function (service
-- role) should be able to write analytics rows for arbitrary users.
REVOKE ALL ON FUNCTION public.track_simple_analytics(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_simple_analytics(uuid, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.track_simple_analytics(uuid, text, jsonb) IS
  'Inserts one funnel event into usage_analytics. Called by the track-analytics edge function using the service role.';
COMMENT ON TABLE public.contact_messages IS
  'Support form submissions; source of truth if transactional email is unavailable.';
COMMENT ON TABLE public.error_logs IS
  'Client and edge-function error sink written by the log-error edge function.';
