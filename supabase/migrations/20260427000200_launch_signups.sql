-- ============================================================
-- 20260427000200_launch_signups.sql
-- RSVP / signup capture for the launch-day landing page and
-- future RSVP-style forms. Anon role can INSERT but cannot
-- SELECT. service_role has full access for export.
-- Replaces the Google Sheets webhook the form was pointing at.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.launch_signups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL,
  first_name    text   NOT NULL,
  last_name     text   NOT NULL,
  organization  text,
  title         text,
  source        text   NOT NULL DEFAULT 'launch-day-rsvp',
  user_agent    text,
  referrer      text,
  consented_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT launch_signups_email_per_source_unique UNIQUE (email, source)
);

COMMENT ON TABLE public.launch_signups IS
  'RSVP / signup capture for the launch-day form and future RSVP-style intake. Public anon role can INSERT but cannot SELECT. Read access is service_role only.';

CREATE INDEX IF NOT EXISTS idx_launch_signups_created_at
  ON public.launch_signups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_signups_source
  ON public.launch_signups (source);

ALTER TABLE public.launch_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert launch_signups" ON public.launch_signups;
CREATE POLICY "anon insert launch_signups"
  ON public.launch_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT (email, first_name, last_name, organization, title, source, user_agent, referrer)
  ON public.launch_signups TO anon, authenticated;
