-- =====================================================================
-- 20260519010000_pride_volunteer_sync.sql
-- Coordinate the Pride road-tour volunteer list with the generic
-- volunteer list: every /pride/signup submission should also land in
-- public.volunteers so a Pride signup shows up on BOTH admin surfaces
-- (/admin/pride/volunteers and /admin/volunteers).
--
-- Mechanism: an AFTER INSERT trigger on public.pride_volunteers that
-- upserts a matching row into public.volunteers keyed on email. The
-- trigger is SECURITY DEFINER so it works regardless of which role did
-- the insert (the Netlify service-role function, or a direct anon
-- insert allowed by the pride_volunteers RLS policy).
--
-- The generic row is non-destructive: if a volunteers row already
-- exists for that email we only fold the 'pride_tabling' interest in
-- and never overwrite their existing contact data or workflow status.
--
-- county is intentionally left NULL — there is no ZIP->county helper
-- (public.county_for_zip / public.ohio_zip_county) in this project.
-- =====================================================================

create or replace function public.sync_pride_volunteer_to_volunteers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.volunteers as v (
    first_name, last_name, email, phone, city, zip,
    interests, referral_source, additional_notes,
    email_optin, sms_optin, status
  ) values (
    new.first_name, new.last_name, new.email, new.phone, new.city, new.zip,
    array['pride_tabling']::text[],
    'pride_signup',
    nullif(new.notes, ''),
    coalesce(new.consent_communications, true),
    false,
    'new'
  )
  on conflict (email) do update set
    interests = (
      select array(
        select distinct e
        from unnest(coalesce(v.interests, '{}'::text[]) || array['pride_tabling']) as e
      )
    ),
    phone = coalesce(v.phone, excluded.phone),
    city  = coalesce(v.city,  excluded.city),
    zip   = coalesce(v.zip,   excluded.zip),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_pride_volunteer on public.pride_volunteers;
create trigger trg_sync_pride_volunteer
  after insert on public.pride_volunteers
  for each row execute function public.sync_pride_volunteer_to_volunteers();

-- ---------------------------------------------------------------------
-- Backfill: mirror every existing pride_volunteers row into volunteers.
-- ---------------------------------------------------------------------
insert into public.volunteers as v (
  first_name, last_name, email, phone, city, zip,
  interests, referral_source, additional_notes,
  email_optin, sms_optin, status
)
select
  pv.first_name, pv.last_name, pv.email, pv.phone, pv.city, pv.zip,
  array['pride_tabling']::text[],
  'pride_signup',
  nullif(pv.notes, ''),
  coalesce(pv.consent_communications, true),
  false,
  'new'
from public.pride_volunteers pv
on conflict (email) do update set
  interests = (
    select array(
      select distinct e
      from unnest(coalesce(v.interests, '{}'::text[]) || array['pride_tabling']) as e
    )
  ),
  updated_at = now();
