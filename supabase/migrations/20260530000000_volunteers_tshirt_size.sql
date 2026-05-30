-- =====================================================================
-- 20260530000000_volunteers_tshirt_size.sql
--
-- Adds t-shirt size capture to public.volunteers. Surfaced on the
-- /volunteer form when a volunteer opts in to "Walk in a Pride parade"
-- (interest value 'walk_pride_parade'), so we can have a Pride shirt
-- ready for marchers.
--
-- The interests array is unconstrained text[], so the new
-- 'walk_pride_parade' interest value needs no DB change — only the
-- volunteer-submit function's allow-list. This migration adds the one
-- new scalar column, grants anon column-level INSERT (matching the
-- existing pattern), and pokes PostgREST so the API sees it.
--
-- Safe to re-run.
-- =====================================================================

alter table public.volunteers
  add column if not exists tshirt_size text;

alter table public.volunteers drop constraint if exists volunteers_tshirt_size_check;
alter table public.volunteers
  add  constraint volunteers_tshirt_size_check
  check (
    tshirt_size in ('xs','s','m','l','xl','2xl','3xl','4xl')
    or tshirt_size is null
  );

comment on column public.volunteers.tshirt_size is
  'Preferred t-shirt size for Pride parade marchers. Captured on /volunteer when the volunteer selects the "Walk in a Pride parade" interest.';

-- Anon role needs explicit column-level INSERT on the new column so
-- direct client inserts keep working (the Netlify function uses the
-- service-role key and bypasses RLS, but we mirror the existing grants).
grant insert (tshirt_size) on public.volunteers to anon, authenticated;

-- Refresh the PostgREST schema cache so the API sees the column now.
notify pgrst, 'reload schema';
