-- =============================================================================
-- Endorsements: module refinements (2026-09-07)
-- -----------------------------------------------------------------------------
-- Five changes, all driven by the same review of the admin queue:
--
--   1. County is a real column. Judicial and county offices are county races,
--      but the form only had "district", so a judge's county ended up in
--      district ("Montgomery County"), in the office title, or nowhere. The
--      queue could not show at a glance which county a judge was running in.
--      `county` references a new `ohio_counties` lookup (88 rows) so the value
--      is always the same spelling, the form offers a dropdown, and the two
--      rows that had put the county in `district` are moved over.
--
--   2. "Days in stage" was measuring `updated_at`, which the touch trigger bumps
--      on every write: saving reviewer notes, toggling publication, a bulk
--      backfill. Every open application read "3 days in stage" after the
--      2026-09-04 edit. `status_changed_at` is stamped only when `status`
--      actually changes, and is backfilled from the decision dates and the
--      activity trail.
--
--   3. Candidates can attach a photo. A private `endorsement-photos` bucket:
--      anon may upload into `submissions/<application id>/` only, the row may
--      only point at its own folder, and reads need endorsements:read. The
--      public site keeps using the curated photos in lib/endorsement-content.mjs;
--      this is the submitted original that staff pull from.
--
--   4. Who filled the form in. `submitted_by_kind` (candidate / campaign_staff /
--      pac_staff) plus the name, role, and email of the person when it was not
--      the candidate, so the record says whose words these are.
--
--   5. The office catalog learns `requires_county`, the county analogue of
--      `requires_district`, so the form can require a county for a county race
--      without a deploy.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ── 1. Ohio counties ────────────────────────────────────────────────────────
create table if not exists public.ohio_counties (
  name       text primary key,
  sort_order int  not null default 0
);

comment on table public.ohio_counties is
  'The 88 Ohio counties, short name only ("Hamilton", not "Hamilton County"). '
  'Lookup for endorsement_applications.county and the application form.';

insert into public.ohio_counties (name, sort_order)
select n, ord
  from unnest(array[
    'Adams','Allen','Ashland','Ashtabula','Athens','Auglaize','Belmont','Brown',
    'Butler','Carroll','Champaign','Clark','Clermont','Clinton','Columbiana',
    'Coshocton','Crawford','Cuyahoga','Darke','Defiance','Delaware','Erie',
    'Fairfield','Fayette','Franklin','Fulton','Gallia','Geauga','Greene',
    'Guernsey','Hamilton','Hancock','Hardin','Harrison','Henry','Highland',
    'Hocking','Holmes','Huron','Jackson','Jefferson','Knox','Lake','Lawrence',
    'Licking','Logan','Lorain','Lucas','Madison','Mahoning','Marion','Medina',
    'Meigs','Mercer','Miami','Monroe','Montgomery','Morgan','Morrow','Muskingum',
    'Noble','Ottawa','Paulding','Perry','Pickaway','Pike','Portage','Preble',
    'Putnam','Richland','Ross','Sandusky','Scioto','Seneca','Shelby','Stark',
    'Summit','Trumbull','Tuscarawas','Union','Van Wert','Vinton','Warren',
    'Washington','Wayne','Williams','Wood','Wyandot'
  ]) with ordinality as t(n, ord)
on conflict (name) do update set sort_order = excluded.sort_order;

alter table public.ohio_counties enable row level security;

drop policy if exists "anyone can read counties" on public.ohio_counties;
create policy "anyone can read counties"
  on public.ohio_counties for select
  to anon, authenticated
  using (true);

grant select on public.ohio_counties to anon, authenticated;

-- ── 2. Office catalog: which offices are county races ───────────────────────
alter table public.endorsement_office_options
  add column if not exists requires_county boolean not null default false;

comment on column public.endorsement_office_options.requires_county is
  'The form requires a county for this office (county courts, county row '
  'offices). The county field is shown for every local and judicial office '
  'either way; this only makes it mandatory.';

update public.endorsement_office_options
   set requires_county = true
 where (path = 'judicial' and label not in ('Ohio Supreme Court', 'Ohio Court of Appeals'))
    or (path = 'local' and label in (
          'County Commissioner',
          'County Auditor / Recorder / Treasurer / Clerk',
          'Prosecuting Attorney (County / City)',
          'Sheriff'));

-- ── 3. New application columns ──────────────────────────────────────────────
alter table public.endorsement_applications
  add column if not exists county             text references public.ohio_counties(name) on update cascade,
  add column if not exists status_changed_at  timestamptz,
  add column if not exists photo_path         text,
  add column if not exists submitted_by_kind  text not null default 'candidate',
  add column if not exists submitted_by_name  text,
  add column if not exists submitted_by_role  text,
  add column if not exists submitted_by_email text;

alter table public.endorsement_applications
  drop constraint if exists endorsement_applications_submitted_by_kind_check;
alter table public.endorsement_applications
  add constraint endorsement_applications_submitted_by_kind_check
  check (submitted_by_kind in ('candidate', 'campaign_staff', 'pac_staff'));

comment on column public.endorsement_applications.county is
  'County the office serves (short name, references ohio_counties). The '
  'jurisdiction for judicial and county races; optional context for the rest.';
comment on column public.endorsement_applications.status_changed_at is
  'When status last changed. Stamped by trg_endorsement_stamp_status_changed_at; '
  'this is what "days in stage" measures. updated_at moves on every write and '
  'must not be used for it.';
comment on column public.endorsement_applications.photo_path is
  'Object path in the private endorsement-photos bucket: submissions/<id>/... '
  'when the candidate attached it, staff/<id>/... when staff uploaded it. The '
  'public site still uses the curated photo in lib/endorsement-content.mjs.';
comment on column public.endorsement_applications.submitted_by_kind is
  'Who filled the application in: candidate, campaign_staff, or pac_staff. '
  'When it is not the candidate, submitted_by_name / _role / _email say who.';

create index if not exists idx_endorsement_county
  on public.endorsement_applications(county);

-- Backfill status_changed_at before anything else in this file touches the
-- rows. It is derived from the decision dates and the activity trail, never
-- from updated_at, which is exactly the value that was wrong.
update public.endorsement_applications a
   set status_changed_at = coalesce(
         case a.status
           when 'submitted' then a.created_at
           when 'endorsed'  then a.endorsed_at
           else null
         end,
         (select max(x.created_at)
            from public.endorsement_activity x
           where x.application_id = a.id
             and x.event_type in ('status_change', 'stage_change', 'decision')),
         a.reviewed_at,
         a.created_at)
 where a.status_changed_at is null;

alter table public.endorsement_applications
  alter column status_changed_at set default now(),
  alter column status_changed_at set not null;

create or replace function public.endorsement_stamp_status_changed_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_stamp_status_changed_at on public.endorsement_applications;
create trigger trg_endorsement_stamp_status_changed_at
  before update of status on public.endorsement_applications
  for each row execute function public.endorsement_stamp_status_changed_at();

-- Move the county out of `district` where a judicial or county applicant had
-- typed it there ("Montgomery County"). The district is cleared only when it
-- held nothing but the county name.
update public.endorsement_applications a
   set county   = c.name,
       district = case
                    when lower(btrim(a.district)) in (lower(c.name), lower(c.name || ' county')) then null
                    else a.district
                  end
  from public.ohio_counties c
 where a.county is null
   and a.district is not null
   and lower(btrim(a.district)) in (lower(c.name), lower(c.name || ' county'));

-- The activity trail records edits and photo changes now. The repo's original
-- CHECK listed a closed set that did not even include status_change (the live
-- table never had the constraint); drop it so both agree.
alter table public.endorsement_activity
  drop constraint if exists endorsement_activity_event_type_check;

-- ── 4. Anon submission policy: a row may only point at its own photo ────────
drop policy if exists "anon can submit applications" on public.endorsement_applications;
create policy "anon can submit applications"
  on public.endorsement_applications
  for insert to anon
  with check (
    status = 'submitted'
    and reviewer_notes is null
    and reviewed_by is null
    and reviewed_at is null
    and endorsed_at is null
    and (photo_path is null or photo_path like ('submissions/' || id::text || '/%'))
  );

-- ── 5. Photo bucket ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'endorsement-photos', 'endorsement-photos', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A candidate uploads before inserting the row, into a folder named by the
-- application id the form generated. The path shape is pinned so the anon key
-- cannot write anywhere else in the bucket, and anon has no SELECT, so a
-- submitter can neither list nor read back what is there.
drop policy if exists "candidates can upload endorsement photos" on storage.objects;
create policy "candidates can upload endorsement photos"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'endorsement-photos'
    and name ~ '^submissions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$'
  );

drop policy if exists "endorsements read can view photos" on storage.objects;
create policy "endorsements read can view photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'endorsement-photos' and public.has_permission('endorsements', 'read'));

drop policy if exists "endorsements write can manage photos" on storage.objects;
create policy "endorsements write can manage photos"
  on storage.objects for all to authenticated
  using (bucket_id = 'endorsement-photos' and public.has_permission('endorsements', 'write'))
  with check (bucket_id = 'endorsement-photos' and public.has_permission('endorsements', 'write'));

-- ── 6. Public view: county joins the published columns ──────────────────────
-- Same columns in the same order, plus county at the end, so CREATE OR REPLACE
-- is enough. County is the race's jurisdiction, not a personal detail.
create or replace view public.public_endorsements as
  select id,
         candidate_name,
         pronouns,
         office_sought,
         district,
         election_year,
         website,
         bio,
         is_out,
         coalesce(endorsed_at, reviewed_at, updated_at) as endorsed_at,
         endorsement_path::text                         as endorsement_path,
         county
    from public.endorsement_applications
   where status = 'endorsed'
     and is_published;

grant select on public.public_endorsements to anon, authenticated;
