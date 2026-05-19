-- ============================================================
-- Ohio Pride PAC :: Road Tour assignment model
-- Adds pride_event_volunteers + helper views (already applied to
-- the live Supabase project dkdxefzhttkmjhdbkvqn on 2026-05-19).
-- Drop this file into supabase/migrations/ to keep the local
-- and remote schemas in sync.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.pride_assignment_status AS ENUM ('confirmed','tentative','declined','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pride_event_volunteers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.pride_events(id)     ON DELETE CASCADE,
  volunteer_id    uuid NOT NULL REFERENCES public.pride_volunteers(id) ON DELETE CASCADE,
  status          public.pride_assignment_status NOT NULL DEFAULT 'tentative',
  role            text NOT NULL DEFAULT 'marcher',
  is_captain      boolean NOT NULL DEFAULT false,
  notes           text,
  set_by          text,
  set_at          timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, volunteer_id)
);

COMMENT ON TABLE public.pride_event_volunteers IS
  'Assignment table linking pride_volunteers to pride_events with confirm/tentative/decline/remove status. Driven from /admin/pride.';

CREATE INDEX IF NOT EXISTS pev_event_idx     ON public.pride_event_volunteers (event_id);
CREATE INDEX IF NOT EXISTS pev_volunteer_idx ON public.pride_event_volunteers (volunteer_id);
CREATE INDEX IF NOT EXISTS pev_status_idx    ON public.pride_event_volunteers (status);

CREATE OR REPLACE FUNCTION public.pev_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pev_touch_updated_at ON public.pride_event_volunteers;
CREATE TRIGGER pev_touch_updated_at
  BEFORE UPDATE ON public.pride_event_volunteers
  FOR EACH ROW EXECUTE FUNCTION public.pev_touch_updated_at();

CREATE OR REPLACE FUNCTION public.pev_touch_set_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.set_at = now(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pev_touch_set_at ON public.pride_event_volunteers;
CREATE TRIGGER pev_touch_set_at
  BEFORE UPDATE ON public.pride_event_volunteers
  FOR EACH ROW EXECUTE FUNCTION public.pev_touch_set_at();

ALTER TABLE public.pride_event_volunteers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pev_admin_select ON public.pride_event_volunteers;
DROP POLICY IF EXISTS pev_admin_insert ON public.pride_event_volunteers;
DROP POLICY IF EXISTS pev_admin_update ON public.pride_event_volunteers;
DROP POLICY IF EXISTS pev_admin_delete ON public.pride_event_volunteers;

CREATE POLICY pev_admin_select ON public.pride_event_volunteers
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY pev_admin_insert ON public.pride_event_volunteers
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY pev_admin_update ON public.pride_event_volunteers
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY pev_admin_delete ON public.pride_event_volunteers
  FOR DELETE TO authenticated USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pride_event_volunteers TO authenticated;

CREATE OR REPLACE VIEW public.pride_event_volunteers_v AS
SELECT
  pev.id, pev.event_id, pev.volunteer_id, pev.status, pev.role, pev.is_captain,
  pev.notes, pev.set_by, pev.set_at, pev.created_at, pev.updated_at,
  e.slug AS event_slug, e.name AS event_name, e.city AS event_city, e.region AS event_region,
  e.event_date, e.pac_priority, e.pac_role AS event_pac_role,
  v.first_name, v.last_name, v.email AS volunteer_email,
  v.phone AS volunteer_phone, v.city AS volunteer_city
FROM public.pride_event_volunteers pev
JOIN public.pride_events     e ON e.id = pev.event_id
JOIN public.pride_volunteers v ON v.id = pev.volunteer_id;

GRANT SELECT ON public.pride_event_volunteers_v TO authenticated;

ALTER FUNCTION public.pev_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.pev_touch_set_at()     SET search_path = '';

CREATE OR REPLACE VIEW public.pride_event_roster_v AS
SELECT
  e.id AS event_id, e.slug, e.name, e.city, e.region, e.event_date,
  e.pac_priority, e.pac_attending, e.pac_role, e.registration_status,
  COALESCE(c.cnt, 0)::int AS confirmed_count,
  COALESCE(t.cnt, 0)::int AS tentative_count,
  COALESCE(d.cnt, 0)::int AS declined_count,
  COALESCE(r.cnt, 0)::int AS removed_count,
  (COALESCE(c.cnt,0) + COALESCE(t.cnt,0))::int AS pipeline_count
FROM public.pride_events e
LEFT JOIN (SELECT event_id, COUNT(*) cnt FROM public.pride_event_volunteers WHERE status='confirmed' GROUP BY event_id) c ON c.event_id=e.id
LEFT JOIN (SELECT event_id, COUNT(*) cnt FROM public.pride_event_volunteers WHERE status='tentative' GROUP BY event_id) t ON t.event_id=e.id
LEFT JOIN (SELECT event_id, COUNT(*) cnt FROM public.pride_event_volunteers WHERE status='declined'  GROUP BY event_id) d ON d.event_id=e.id
LEFT JOIN (SELECT event_id, COUNT(*) cnt FROM public.pride_event_volunteers WHERE status='removed'   GROUP BY event_id) r ON r.event_id=e.id;

GRANT SELECT ON public.pride_event_roster_v TO authenticated;

-- Use SECURITY INVOKER so RLS on the base tables (pride_events,
-- pride_volunteers, pride_event_volunteers) is enforced against the
-- calling user, not the view owner. Required to pass advisor 0010.
ALTER VIEW public.pride_event_volunteers_v SET (security_invoker = true);
ALTER VIEW public.pride_event_roster_v     SET (security_invoker = true);
